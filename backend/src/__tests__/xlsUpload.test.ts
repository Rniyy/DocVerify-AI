import fs from "fs";
import os from "os";
import path from "path";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AddressInfo } from "net";
import { Server } from "http";
import { createApp } from "../app";
import { signToken } from "../services/auth/tokenService";
import { extractDocument } from "../services/extraction";

describe("legacy .xls support", () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "docverify-xls-"));
    file = path.join(dir, "packing.xls");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Invoice No", "INV-1"],
        ["Description", "Qty", "Unit Price", "Amount"],
        ["Star Anise", 10, 2, 20],
      ]),
      "S1"
    );
    XLSX.writeFile(wb, file, { bookType: "biff8" });
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("extracts rows from an .xls file", async () => {
    const result = await extractDocument(file, "packing.xls");
    expect(result?.type).toBe("excel");
    if (result?.type === "excel") {
      expect(result.sheets[0].rows[2]).toEqual(["Star Anise", 10, 2, 20]);
    }
  });

  it("accepts an .xls through the upload endpoint", async () => {
    const server: Server = createApp().listen(0);
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/documents`;
      const form = new FormData();
      for (const name of ["packing.xls", "invoice.xls"]) {
        form.append(
          "documents",
          new Blob([fs.readFileSync(file)], { type: "application/vnd.ms-excel" }),
          name
        );
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${signToken({ sub: 1, email: "t@example.com" })}` },
        body: form,
      });
      const body = JSON.stringify(await res.json());
      expect(res.status).toBe(201);
      expect(body).toContain("packing.xls");
      expect(body).toContain("invoice.xls");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("still rejects unsupported types like .csv", async () => {
    const server: Server = createApp().listen(0);
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/documents`;
      const form = new FormData();
      form.append("documents", new Blob(["a,b"], { type: "text/csv" }), "x.csv");
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${signToken({ sub: 1, email: "t@example.com" })}` },
        body: form,
      });
      expect(res.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
