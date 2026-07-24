import type { PaymentRequirements } from "@x402/core/types";
import type { Address, Hex } from "viem";
import { getAddress, recoverTypedDataAddress } from "viem";
import {
  HyperEvmExecutionIntentInput,
  SignedHyperEvmExecutionIntent,
  SignedHyperEvmExecutionIntentSchema,
  ZERO_BYTES32,
} from "./types";
import { hashPaymentRequirements } from "./payment";
import {
  buildExecutionIntentTypedData,
  hashExecutionIntent,
  normalizeBytes32,
  normalizeExecutionIntent,
} from "./typed-data";

export type IntentSigner = {
  address?: Address | string;
  account?: { address?: Address | string } | Address | string;
  signTypedData: (parameters: any) => Promise<Hex | string>;
};

export type SignExecutionIntentOptions =
  | { paymentRequirements: PaymentRequirements; paymentRequirementsHash?: never }
  | { paymentRequirements?: never; paymentRequirementsHash: Hex | string };

export function getIntentSignerAddress(signer: IntentSigner): Address {
  const explicitAddress = signer.address
    ? getAddress(signer.address)
    : undefined;
  const account = signer.account;
  const accountValue =
    typeof account === "string" ? account : account?.address;
  const accountAddress = accountValue ? getAddress(accountValue) : undefined;

  if (
    explicitAddress &&
    accountAddress &&
    explicitAddress !== accountAddress
  ) {
    throw new Error(
      "Intent signer address must match the configured signing account",
    );
  }

  const address = explicitAddress ?? accountAddress;
  if (!address) {
    throw new Error("Intent signer is missing an EVM address");
  }

  return address;
}

export async function signExecutionIntent(
  input: HyperEvmExecutionIntentInput,
  signer: IntentSigner,
  options: SignExecutionIntentOptions,
): Promise<SignedHyperEvmExecutionIntent> {
  const signerAddress = getIntentSignerAddress(signer);
  const intent = normalizeExecutionIntent(input);
  if (getAddress(intent.user) !== signerAddress) {
    throw new Error("Execution intent user must match the EIP-712 signer");
  }

  const paymentRequirementsHash = resolvePaymentRequirementsHash(options);
  if (paymentRequirementsHash.toLowerCase() === ZERO_BYTES32) {
    throw new Error("A signed execution intent requires finalized payment requirements");
  }

  const typedData = buildExecutionIntentTypedData(intent, {
    paymentRequirementsHash,
  });
  const signature = await signTypedDataWithSigner(signer, typedData);
  const signed = {
    intent,
    paymentRequirementsHash,
    intentHash: hashExecutionIntent(intent, { paymentRequirementsHash }),
    signature,
    signer: signerAddress,
  };

  return SignedHyperEvmExecutionIntentSchema.parse(signed);
}

export async function recoverExecutionIntentSigner(
  signedIntent: SignedHyperEvmExecutionIntent,
): Promise<Address> {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const recovered = await recoverTypedDataAddress({
    ...buildExecutionIntentTypedData(parsed.intent, {
      paymentRequirementsHash: parsed.paymentRequirementsHash,
    }),
    signature: parsed.signature as Hex,
  });

  return getAddress(recovered);
}

export async function verifyExecutionIntentSignature(
  signedIntent: SignedHyperEvmExecutionIntent,
): Promise<{ valid: boolean; signer: Address; intentHash: Hex }> {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const expectedHash = hashExecutionIntent(parsed.intent, {
    paymentRequirementsHash: parsed.paymentRequirementsHash,
  });
  const signer = await recoverExecutionIntentSigner(parsed);
  const valid =
    expectedHash.toLowerCase() === parsed.intentHash.toLowerCase() &&
    signer === getAddress(parsed.intent.user);

  return { valid, signer, intentHash: expectedHash };
}

function resolvePaymentRequirementsHash(
  options: SignExecutionIntentOptions,
): Hex {
  if ("paymentRequirements" in options && options.paymentRequirements) {
    return hashPaymentRequirements(options.paymentRequirements);
  }
  return normalizeBytes32(options.paymentRequirementsHash);
}

async function signTypedDataWithSigner(
  signer: IntentSigner,
  typedData: ReturnType<typeof buildExecutionIntentTypedData>,
): Promise<Hex> {
  const parameters = signer.account
    ? { ...typedData, account: signer.account }
    : typedData;
  return (await signer.signTypedData(parameters)) as Hex;
}
