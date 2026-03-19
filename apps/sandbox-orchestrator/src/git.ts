export function buildAuthRepoUrl(repoUrl: string, token?: string, username = 'x-access-token'): string {
  if (!token || !isGithubHttpsUrl(repoUrl)) {
    return repoUrl;
  }
  try {
    const parsed = new URL(repoUrl);
    if (parsed.password || parsed.username) {
      return repoUrl;
    }
    parsed.username = encodeURIComponent(username);
    parsed.password = token;
    return parsed.toString();
  } catch {
    return repoUrl;
  }
}

export function redactUrlCredentials(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? '***' : '';
      parsed.password = parsed.password ? '***' : '';
      return parsed.toString();
    }
    return repoUrl;
  } catch {
    return repoUrl;
  }
}

function isGithubHttpsUrl(repoUrl: string): boolean {
  try {
    const parsed = new URL(repoUrl);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'github.com';
  } catch {
    return false;
  }
}

export function extractTokenFromRepoUrl(repoUrl: string): string | undefined {
  try {
    const parsed = new URL(repoUrl);
    if (!parsed.password) {
      return undefined;
    }
    return parsed.password;
  } catch {
    return undefined;
  }
}
