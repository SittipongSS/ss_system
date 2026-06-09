import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // This app fetches data via client-side `fetch` inside useEffect + apiCache
      // by design (no RSC/React Query). The React Compiler's set-state-in-effect
      // rule can't tell that benign post-fetch setState from the real anti-pattern,
      // so it false-positives on every data-loading page. Disabled project-wide.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
