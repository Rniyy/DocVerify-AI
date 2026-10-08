import { AddressInfo } from "net";
import { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonDetail } from "../types/history";

const getComparisonDetail = vi.fn();
const findUserByEmail = vi.fn();

vi.mock("../services/persistence/comparisonsRepository", () => ({
  getComparisonDetail: (...a: unknown[]) => getComparisonDetail(...a),
  listComparisonsForUser: vi.fn().mockResolvedValue([]),
  saveComparison: vi.fn(),
  saveComparisonResults: vi.fn(),
}));
vi.mock("../services/persistence/usersRepository", () => ({
  findUserByEmail: (...a: unknown[]) => findUserByEmail(...a),
  createUser: vi.fn(),
}));

import { createApp } from "../app";
import { signToken } from "../services/auth/tokenService";

let server: Server;
let base: string;
const auth = { Authorization: `Bearer ${signToken({ sub: 7, email: "me@example.com" })}` };

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  getComparisonDetail.mockReset();
  findUserByEmail.mockReset();
});

const detail: ComparisonDetail = {
  id: 5,
  createdAt: "2026-10-08T00:00:00Z",
  documentNames: ["invoice.pdf", "packing.xlsx"],
  report: {
    summary: { documentsReviewed: 2, fieldsChecked: 1, matches: 0, warnings: 0, errors: 1 },
    documentFieldResults: [{ field: "totalAmount", values: [100, 90], status: "mismatch", difference: "10" }],
    lineItemResults: [],
    calculationIssues: [],
  },
};

describe("GET /comparisons/:id/export", () => {
  it("requires authentication", async () => {
    expect((await fetch(`${base}/comparisons/5/export`)).status).toBe(401);
  });

  it("returns the comparison as a CSV attachment, scoped to the logged-in user", async () => {
    getComparisonDetail.mockResolvedValue(detail);
    const res = await fetch(`${base}/comparisons/5/export`, { headers: auth });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="comparison-5.csv"');
    expect(getComparisonDetail).toHaveBeenCalledWith(5, 7); // id, then the caller's own user id

    const body = await res.text();
    expect(body).toContain("Section,Line Item,Field / Rule,Status,Document,invoice.pdf,packing.xlsx");
    expect(body).toContain("Document field,,totalAmount,mismatch,,100,90,10");
  });

  it("returns 404 for a comparison that doesn't exist or belongs to someone else", async () => {
    getComparisonDetail.mockResolvedValue(null);
    expect((await fetch(`${base}/comparisons/99/export`, { headers: auth })).status).toBe(404);
  });

  it("rejects a non-numeric id", async () => {
    expect((await fetch(`${base}/comparisons/abc/export`, { headers: auth })).status).toBe(400);
    expect(getComparisonDetail).not.toHaveBeenCalled();
  });
});

describe("POST /auth/login rate limiting", () => {
  it("answers 429 with Retry-After after 10 attempts from one client", async () => {
    findUserByEmail.mockResolvedValue(null); // every attempt is a failed login
    const attempt = () =>
      fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "wrongpassword" }),
      });

    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
