import type { Address, Hex } from "viem";
import { getAddress, recoverTypedDataAddress } from "viem";
import {
  HyperEvmExecutionIntentInput,
  SignedHyperEvmExecutionIntent,
  SignedHyperEvmExecutionIntentSchema,
} from "./types";
import {
  ExecutionIntentTypedDataOptions,
  buildExecutionIntentTypedData,
  hashExecutionIntent,
  normalizeExecutionIntent,
} from "./typed-data";

export type IntentSigner = {
  address?: Address | string;
  account?: { address?: Address | string } | Address | string;
  signTypedData: (parameters: any) => Promise<Hex | string>;
};

export interface SignExecutionIntentOptions extends ExecutionIntentTypedDataOptions {}

export interface VerifyExecutionIntentOptions extends ExecutionIntentTypedDataOptions {}

export function getIntentSignerAddress(signer: IntentSigner): Address {
  const account = signer.account;
  const address =
    signer.address ??
    (typeof account === "string" ? account : account?.address);

  if (!address) {
    throw new Error("Intent signer is missing an EVM address");
  }

  return getAddress(address);
}

export async function signExecutionIntent(
  input: HyperEvmExecutionIntentInput,
  signer: IntentSigner,
  options: SignExecutionIntentOptions = {},
): Promise<SignedHyperEvmExecutionIntent> {
  const signerAddress = getIntentSignerAddress(signer);
  const intent = normalizeExecutionIntent({
    ...input,
    user: input.user ?? signerAddress,
  });
  const typedData = buildExecutionIntentTypedData(intent, options);
  const signature = await signTypedDataWithSigner(signer, typedData);
  const signed = {
    intent,
    intentHash: hashExecutionIntent(intent, options),
    signature,
    signer: signerAddress,
  };

  return SignedHyperEvmExecutionIntentSchema.parse(signed);
}

export async function recoverExecutionIntentSigner(
  signedIntent: SignedHyperEvmExecutionIntent,
  options: VerifyExecutionIntentOptions = {},
): Promise<Address> {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const recovered = await recoverTypedDataAddress({
    ...buildExecutionIntentTypedData(parsed.intent, options),
    signature: parsed.signature as Hex,
  });

  return getAddress(recovered);
}

export async function verifyExecutionIntentSignature(
  signedIntent: SignedHyperEvmExecutionIntent,
  options: VerifyExecutionIntentOptions = {},
): Promise<{ valid: boolean; signer: Address; intentHash: Hex }> {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const expectedHash = hashExecutionIntent(parsed.intent, options);
  const signer = await recoverExecutionIntentSigner(parsed, options);
  const valid =
    expectedHash.toLowerCase() === parsed.intentHash.toLowerCase() &&
    signer.toLowerCase() === parsed.intent.user.toLowerCase();

  return { valid, signer, intentHash: expectedHash };
}

async function signTypedDataWithSigner(
  signer: IntentSigner,
  typedData: ReturnType<typeof buildExecutionIntentTypedData>,
): Promise<Hex> {
  try {
    return (await signer.signTypedData(typedData)) as Hex;
  } catch (error) {
    const account = signer.account;
    if (!account) throw error;
    return (await signer.signTypedData({
      ...typedData,
      account,
    })) as Hex;
  }
}
