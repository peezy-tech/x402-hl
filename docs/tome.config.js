/** @type {import('@tomehq/core').TomeConfig} */
export default {
  name: "x402-hl",
  basePath: process.env.X402_HL_DOCS_BASE_PATH ?? "/x402-hl",
  theme: {
    preset: "editorial",
    mode: "auto",
    accent: "#127a5d",
  },
  navigation: [
    { group: "Overview", pages: ["index"] },
    {
      group: "Integration",
      pages: [
        "facilitator",
        "endpoint",
        "production-sample",
      ],
    },
  ],
  topNav: [
    { label: "GitHub", href: "https://github.com/peezy-tech/x402-hl" },
    { label: "npm", href: "https://www.npmjs.com/package/x402-hl" },
  ],
};
