export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  publishedAt: string;
  author: string;
  tags: string[];
  readingTime: number;
}

export const POSTS: BlogPost[] = [
  {
    slug: "what-is-mcp",
    title: "What is MCP? The Model Context Protocol Explained",
    excerpt: "MCP is the new standard that lets AI assistants connect to any tool or data source. Here's everything you need to know.",
    publishedAt: "2025-06-15",
    author: "MCPHub Team",
    tags: ["mcp", "explainer", "anthropic", "getting-started"],
    readingTime: 6,
    content: `
## What is MCP?

The **Model Context Protocol (MCP)** is an open standard created by Anthropic that defines how AI assistants like Claude communicate with external tools, APIs, and data sources. Think of it as a universal adapter — like USB-C for AI.

Before MCP, every AI integration was custom-built. Want Claude to read your files? Write a custom tool. Want it to query a database? Another bespoke integration. MCP standardizes all of this.

## How MCP Works

MCP follows a client-server architecture:

- **MCP Client**: The AI assistant (e.g., Claude Desktop, Cursor, your custom app)
- **MCP Server**: A lightweight process that exposes tools, resources, and prompts

When you install an MCP server, the AI can discover its capabilities automatically and call tools by name — no custom glue code required.

## Why MCP Matters

### For Developers
- Build once, works everywhere (any MCP-compatible AI)
- Standardized error handling and streaming
- Official SDKs for Python, TypeScript, Go, and more
- Growing ecosystem with 1000+ community servers

### For AI Users
- Install servers from a growing marketplace
- Mix and match capabilities
- No vendor lock-in
- Privacy-first (servers run locally by default)

## The MCP Ecosystem Today

As of 2025, MCP has been adopted by:
- **Anthropic** (Claude Desktop, Claude API)
- **Microsoft** (Copilot, GitHub Copilot)
- **Google** (Gemini)
- **Cursor, Zed, Continue** (code editors)
- Hundreds of tool providers (Cloudflare, Stripe, Vercel, etc.)

## Getting Started

1. Install [Claude Desktop](https://claude.ai/download)
2. Pick a server from [MCPHub](/servers)
3. Follow the install command
4. Restart Claude Desktop — your new tools appear automatically

That's it. No configuration files, no API keys (unless the service needs one), no code.

## The Future

MCP is rapidly becoming the standard for AI tool integration. Major cloud providers, IDEs, and SaaS platforms are all building MCP servers. The protocol is also expanding with new primitives like **sampling** (AI-to-AI communication) and **roots** (scoped filesystem access).

Browse the full directory at [MCPHub](/servers) to find servers for your workflow.
    `.trim(),
  },
  {
    slug: "top-10-mcp-servers-devops",
    title: "Top 10 MCP Servers for DevOps Engineers in 2025",
    excerpt: "From Kubernetes to Terraform, these MCP servers supercharge your infrastructure workflows with AI.",
    publishedAt: "2025-06-20",
    author: "MCPHub Team",
    tags: ["devops", "kubernetes", "terraform", "list"],
    readingTime: 8,
    content: `
## The Best MCP Servers for DevOps

DevOps engineers deal with complexity at scale: dozens of services, multiple clouds, endless YAML. MCP servers let you bring Claude into that workflow — querying clusters, explaining runbooks, and even running deployments.

Here are the 10 essential MCP servers for every DevOps engineer.

### 1. Kubernetes MCP Server
Manage your K8s clusters with natural language. List pods, check deployment status, tail logs, exec into containers, and apply manifests — all without leaving your AI assistant.

\`\`\`bash
npx -y mcp-server-kubernetes
\`\`\`

**Best for**: Cluster troubleshooting, deployment management, log analysis

---

### 2. Terraform MCP Server (HashiCorp)
Run \`terraform plan\`, inspect state files, and get AI-assisted explanations of proposed changes before you apply them.

\`\`\`bash
go install github.com/hashicorp/terraform-mcp-server@latest
\`\`\`

**Best for**: Infrastructure as code, safe deployments

---

### 3. AWS MCP Server
Comprehensive AWS coverage: EC2, S3, Lambda, RDS, CloudFormation, IAM, and CloudWatch — all accessible from Claude.

\`\`\`bash
uvx aws-mcp
\`\`\`

**Best for**: Cloud infrastructure management, cost analysis

---

### 4. Azure MCP Server
Microsoft's official server for Azure resources, AKS clusters, Container Registry, and more.

\`\`\`bash
npx -y @azure/mcp-server
\`\`\`

**Best for**: Azure infrastructure, AKS management

---

### 5. Docker MCP Server
Manage containers, build images, inspect networks, and orchestrate Docker Compose applications.

\`\`\`bash
uvx mcp-server-docker
\`\`\`

**Best for**: Local development, container debugging

---

### 6. Prometheus MCP Server
Run PromQL queries, check alert rules, and analyze metrics — great for incident response.

\`\`\`bash
uvx prometheus-mcp-server
\`\`\`

**Best for**: Monitoring, SRE workflows, alerting

---

### 7. GitHub Actions MCP Server
Trigger workflows, check CI run status, download artifacts, and debug failed steps.

\`\`\`bash
npx -y github-actions-mcp-server
\`\`\`

**Best for**: CI/CD management, pipeline debugging

---

### 8. HashiCorp Vault MCP Server
Read and write secrets, manage policies, and inspect PKI certificates without leaving Claude.

\`\`\`bash
go install github.com/hashicorp/vault-mcp@latest
\`\`\`

**Best for**: Secrets management, security audits

---

### 9. Cloudflare MCP Server
Deploy Workers, manage DNS, interact with KV storage and R2 — edge computing from Claude.

\`\`\`bash
npx -y @cloudflare/mcp-server-cloudflare
\`\`\`

**Best for**: Edge deployments, CDN management

---

### 10. Semgrep MCP Server
Run security scans on your codebase and get AI-assisted remediation advice.

\`\`\`bash
uvx mcp-semgrep
\`\`\`

**Best for**: Security reviews, compliance scanning

---

## Setting Up Multiple Servers

Claude Desktop supports running multiple MCP servers simultaneously. A typical DevOps config:

\`\`\`json
{
  "mcpServers": {
    "kubernetes": { "command": "npx", "args": ["-y", "mcp-server-kubernetes"] },
    "aws": { "command": "uvx", "args": ["aws-mcp"] },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }
  }
}
\`\`\`

Browse all DevOps servers on [MCPHub](/category/devops).
    `.trim(),
  },
  {
    slug: "getting-started-mcp-guide",
    title: "Complete Beginner's Guide to Installing MCP Servers",
    excerpt: "Step-by-step guide to installing your first MCP server with Claude Desktop in under 5 minutes.",
    publishedAt: "2025-06-25",
    author: "MCPHub Team",
    tags: ["getting-started", "installation", "tutorial", "claude-desktop"],
    readingTime: 5,
    content: `
## Installing Your First MCP Server

This guide walks you through installing an MCP server with Claude Desktop — the most popular MCP client.

### Prerequisites

1. **Claude Desktop** — [Download here](https://claude.ai/download) (macOS or Windows)
2. **Node.js 18+** — Required for npx-based servers
3. **Python 3.10+** — Required for uvx-based servers (optional)

### Step 1: Choose a Server

Browse [MCPHub's directory](/servers) and pick a server. For this tutorial, we'll use the **Filesystem** server — one of the most useful and safest to start with.

### Step 2: Find the Config File

Claude Desktop stores MCP configuration at:

- **macOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
- **Windows**: \`%APPDATA%\\Claude\\claude_desktop_config.json\`

### Step 3: Edit the Config

Open the file (create it if it doesn't exist) and add:

\`\`\`json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/yourname/Documents"
      ]
    }
  }
}
\`\`\`

Replace \`/Users/yourname/Documents\` with the directory you want Claude to access.

### Step 4: Restart Claude Desktop

Quit and reopen Claude Desktop. You'll see a 🔌 icon in the chat indicating MCP servers are active.

### Step 5: Test It

Try asking Claude:
- "List the files in my Documents folder"
- "What's in my Downloads directory?"
- "Search my files for anything containing 'project proposal'"

### Adding More Servers

You can stack multiple servers in the same config:

\`\`\`json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token" }
    }
  }
}
\`\`\`

### Troubleshooting

**Server won't start?**
- Check that Node.js is installed: \`node --version\`
- Try running the command directly in your terminal

**Tools not showing up?**
- Fully quit Claude Desktop (not just close the window)
- Check the config JSON is valid (no trailing commas)

**Permission errors?**
- Ensure the path in args exists and is readable
- On macOS, grant Full Disk Access to Terminal in System Preferences

Explore the full directory at [MCPHub](/servers) — there are hundreds of servers waiting to extend Claude's capabilities.
    `.trim(),
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
