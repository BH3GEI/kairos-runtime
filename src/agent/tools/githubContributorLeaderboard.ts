export default function createGithubContributorLeaderboard(){
  return {
    name: "githubContributorLeaderboard",
    label: "GitHub contributor leaderboard",
    description: "Fetch up to 300 most recent commits from a GitHub repository and return top 5 contributors by author.login. Does not output raw commits, only final top-5 JSON.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository in owner/repo format" },
        githubToken: { type: "string", description: "Optional GitHub token for higher rate limits" }
      },
      required: ["repo"]
    },
    execute: async (_toolCallId, params) => {
      const { repo, githubToken } = params || {};
      if (!repo || !/^([^/]+)\/([^/]+)$/.test(repo)) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: 'Invalid repo format. Use "owner/repo".' }) }
          ],
          details: { ok: false }
        };
      }

      const per_page = 100;
      const maxCommits = 300;
      let page = 1;
      const accumulated = [];

      const headers = { "User-Agent": "pi-agent-tool" };
      if (githubToken) headers["Authorization"] = `token ${githubToken}`;

      try {
        while (accumulated.length < maxCommits) {
          const url = `https://api.github.com/repos/${repo}/commits?per_page=${per_page}&page=${page}`;
          const res = await fetch(url, { headers });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            return {
              content: [
                { type: "text", text: JSON.stringify({ error: `GitHub API error ${res.status}`, body }) }
              ],
              details: { ok: false }
            };
          }

          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) break;

          accumulated.push(...data);

          if (data.length < per_page) break; // no more pages

          page += 1;
          if (page > 10) break; // safety bound
        }
      } catch (e) {
        return {
          content: [ { type: "text", text: JSON.stringify({ error: String(e) }) } ],
          details: { ok: false }
        };
      }

      const commits = accumulated.slice(0, maxCommits);
      const counts = {};
      for (const c of commits) {
        if (c && c.author && c.author.login) {
          const login = c.author.login;
          counts[login] = (counts[login] || 0) + 1;
        }
      }

      const top = Object.entries(counts)
        .map(([login, cnt]) => ({ login, commits: cnt }))
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 5);

      // Important: never return raw commits. Only return top-5 JSON.
      return {
        content: [ { type: "text", text: JSON.stringify(top) } ],
        details: { ok: true }
      };
    }
  };
}