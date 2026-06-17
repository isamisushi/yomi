import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Yomi",
  description: "Agent-facing React repair context for AI coding agents.",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Why Yomi", link: "/why-yomi" },
      { text: "Demo", link: "/demo" },
      { text: "CLI", link: "/cli" },
      { text: "GitHub", link: "https://github.com/isamisushi/yomi" },
    ],
    sidebar: [
      {
        text: "Understand Yomi",
        items: [
          { text: "Why Yomi", link: "/why-yomi" },
          { text: "Comparison", link: "/comparison" },
          { text: "Limitations", link: "/limitations" },
        ],
      },
      {
        text: "Try It",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Demo Walkthrough", link: "/demo" },
        ],
      },
      {
        text: "Using Yomi",
        items: [
          { text: "Agent Workflow", link: "/agent-workflow" },
          { text: "CLI Reference", link: "/cli" },
          { text: "Runtime Instrumentation", link: "/runtime-instrumentation" },
          { text: "Agent Skills", link: "/agent-skills" },
          { text: "Architecture", link: "/architecture" },
          { text: "Docs Deployment", link: "/deployment" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Docs Inventory", link: "/README" },
          { text: "Publication Guide", link: "/publication" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/isamisushi/yomi" },
    ],
  },
});
