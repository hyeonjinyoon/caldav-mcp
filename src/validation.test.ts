import { describe, expect, test } from "vitest";
import { createCalendarUrlSchema } from "./validation.js";

describe("createCalendarUrlSchema", () => {
	const baseUrl = "https://caldav.example.com/dav";
	const schema = createCalendarUrlSchema(baseUrl);

	test("accepts absolute URL with same origin", () => {
		const result = schema.safeParse(
			"https://caldav.example.com/dav/calendars/personal/",
		);
		expect(result.success).toBe(true);
	});

	test("accepts relative path", () => {
		const result = schema.safeParse("/dav/calendars/personal/");
		expect(result.success).toBe(true);
	});

	test("rejects URL with different host", () => {
		const result = schema.safeParse("https://evil.com/path");
		expect(result.success).toBe(false);
	});

	test("rejects cloud metadata endpoint URL", () => {
		const result = schema.safeParse(
			"http://169.254.169.254/latest/meta-data/",
		);
		expect(result.success).toBe(false);
	});

	test("rejects localhost URL", () => {
		const result = schema.safeParse("http://localhost:8080/admin");
		expect(result.success).toBe(false);
	});

	test("rejects URL with different protocol", () => {
		const result = schema.safeParse(
			"http://caldav.example.com/dav/calendars/",
		);
		expect(result.success).toBe(false);
	});

	test("rejects invalid URL format", () => {
		const result = schema.safeParse("not-a-url-://invalid");
		expect(result.success).toBe(false);
	});
});
