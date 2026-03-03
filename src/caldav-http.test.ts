import { afterEach, describe, expect, test, vi } from "vitest";
import { CalDAVHttp } from "./caldav-http.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
	mockFetch.mockReset();
});

function createClient() {
	return new CalDAVHttp({
		baseUrl: "https://caldav.example.com/dav",
		username: "user",
		password: "pass",
	});
}

function mockResponse(options: {
	ok?: boolean;
	status?: number;
	statusText?: string;
	text?: string;
	headers?: Record<string, string>;
}) {
	return {
		ok: options.ok ?? true,
		status: options.status ?? 200,
		statusText: options.statusText ?? "OK",
		text: () => Promise.resolve(options.text ?? ""),
		headers: new Map(Object.entries(options.headers ?? {})),
	};
}

describe("CalDAVHttp", () => {
	describe("getICS", () => {
		test("resolves relative href against baseUrl", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({ text: "BEGIN:VCALENDAR", headers: { etag: '"abc"' } }),
			);

			await client.getICS("/dav/calendars/user/cal/event.ics");

			expect(mockFetch).toHaveBeenCalledWith(
				"https://caldav.example.com/dav/calendars/user/cal/event.ics",
				expect.objectContaining({ method: "GET" }),
			);
		});

		test("sends correct Authorization header", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(mockResponse({ text: "BEGIN:VCALENDAR" }));

			await client.getICS("/dav/cal/event.ics");

			const expectedAuth = `Basic ${Buffer.from("user:pass").toString("base64")}`;
			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: expectedAuth,
					}),
				}),
			);
		});

		test("returns icsData and etag from response", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({
					text: "BEGIN:VCALENDAR\nEND:VCALENDAR",
					headers: { etag: '"etag-123"' },
				}),
			);

			const result = await client.getICS("/dav/cal/event.ics");

			expect(result.icsData).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
			expect(result.etag).toBe('"etag-123"');
		});

		test("throws on non-2xx response", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({ ok: false, status: 404, statusText: "Not Found" }),
			);

			await expect(client.getICS("/dav/cal/event.ics")).rejects.toThrow(
				"Failed to GET",
			);
		});
	});

	describe("putICS", () => {
		test("sends If-Match with cleaned etag", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({ status: 204, headers: { etag: '"new-etag"' } }),
			);

			await client.putICS("/dav/cal/event.ics", "BEGIN:VCALENDAR", '"old-etag"');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						"If-Match": '"old-etag"',
					}),
				}),
			);
		});

		test("strips weak validator prefix from etag", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(mockResponse({ status: 204 }));

			await client.putICS(
				"/dav/cal/event.ics",
				"BEGIN:VCALENDAR",
				'W/"weak-etag"',
			);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						"If-Match": '"weak-etag"',
					}),
				}),
			);
		});

		test("sends correct Content-Type", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(mockResponse({ status: 204 }));

			await client.putICS("/dav/cal/event.ics", "BEGIN:VCALENDAR", '"etag"');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						"Content-Type": "text/calendar; charset=utf-8",
					}),
				}),
			);
		});

		test("returns new etag from response headers", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({ status: 204, headers: { etag: '"new-etag"' } }),
			);

			const result = await client.putICS(
				"/dav/cal/event.ics",
				"BEGIN:VCALENDAR",
				'"old-etag"',
			);

			expect(result).toBe('"new-etag"');
		});

		test("throws specific error on 412 (etag mismatch)", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({
					ok: false,
					status: 412,
					statusText: "Precondition Failed",
				}),
			);

			await expect(
				client.putICS("/dav/cal/event.ics", "BEGIN:VCALENDAR", '"old-etag"'),
			).rejects.toThrow("ETag mismatch");
		});

		test("throws on other non-2xx responses", async () => {
			const client = createClient();
			mockFetch.mockResolvedValue(
				mockResponse({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
				}),
			);

			await expect(
				client.putICS("/dav/cal/event.ics", "BEGIN:VCALENDAR", '"etag"'),
			).rejects.toThrow("Failed to PUT");
		});
	});
});
