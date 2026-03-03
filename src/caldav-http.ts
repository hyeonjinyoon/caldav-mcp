export interface CalDAVHttpConfig {
	baseUrl: string;
	username: string;
	password: string;
}

export class CalDAVHttp {
	private authHeader: string;
	private baseUrl: string;

	constructor(config: CalDAVHttpConfig) {
		this.baseUrl = config.baseUrl;
		this.authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
	}

	async getICS(href: string): Promise<{ icsData: string; etag: string }> {
		const url = new URL(href, this.baseUrl).toString();
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: this.authHeader,
				Accept: "text/calendar",
			},
		});
		if (!response.ok) {
			throw new Error(
				`Failed to GET ${href}: ${response.status} ${response.statusText}`,
			);
		}
		const icsData = await response.text();
		const etag = response.headers.get("etag") ?? "";
		return { icsData, etag };
	}

	async putICS(href: string, icsData: string, etag: string): Promise<string> {
		const url = new URL(href, this.baseUrl).toString();
		const cleanEtag = etag.replace(/^W\//, "").trim();
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				Authorization: this.authHeader,
				"Content-Type": "text/calendar; charset=utf-8",
				"If-Match": cleanEtag,
			},
			body: icsData,
		});
		if (!response.ok) {
			if (response.status === 412) {
				throw new Error(
					"ETag mismatch: the event was modified by another client. Please retry.",
				);
			}
			throw new Error(
				`Failed to PUT ${href}: ${response.status} ${response.statusText}`,
			);
		}
		return response.headers.get("etag") ?? "";
	}
}
