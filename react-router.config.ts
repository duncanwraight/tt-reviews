import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Use file-based routing (default when no routes specified)
  future: {
    unstable_viteEnvironmentApi: true,
  },
} satisfies Config;
