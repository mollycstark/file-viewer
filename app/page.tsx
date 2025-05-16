"use client";

import { useState, useEffect } from "react";

const API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Im1vbGx5Yy5zdGFya0BnbWFpbC5jb20iLCJhc3Nlc3NtZW50IjoiZnVsbF9zdGFjayIsImNyZWF0ZWRfYXQiOiIyMDI1LTA1LTE2VDE3OjI5OjM5LjYxNjQ3NzA3M1oiLCJpYXQiOjE3NDc0MTY1Nzl9.cPd1-DtcN7rVkXZQt0b7DNzCwB1mXw3hxzfLpuQBwag";
const BASE_URL = "https://mintlify-take-home.com";

type FileTreeNode = {
  path: string;
  metadata: {
    size: number;
    created_at: string;
    checksum: string;
  };
};

async function fetchAllValidFiles(): Promise<FileTreeNode[]> {
  const collectedFiles: FileTreeNode[] = [];
  let attempts = 0;

  while (collectedFiles.length < 30 && attempts < 200) {
    attempts++;

    const payload = {
      received_files: collectedFiles.filter(
        (f) =>
          typeof f?.path === "string" &&
          f?.metadata &&
          typeof f.metadata.size === "number" &&
          typeof f.metadata.created_at === "string" &&
          typeof f.metadata.checksum === "string"
      ),
    };

    try {
      console.log("Sending payload:", JSON.stringify(payload, null, 2));

      const res = await fetch(`${BASE_URL}/api/file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn("API call failed:", res.status, errorText);
        continue;
      }

      const newFile = await res.json();

      if (
        typeof newFile?.path === "string" &&
        newFile?.metadata &&
        typeof newFile.metadata.size === "number" &&
        typeof newFile.metadata.created_at === "string" &&
        newFile.metadata.created_at.length > 0 &&
        typeof newFile.metadata.checksum === "string" &&
        newFile.metadata.checksum.length > 0
      ) {
        const alreadyExists = collectedFiles.some(
          (f) => f.path === newFile.path
        );
        if (!alreadyExists) {
          collectedFiles.push(newFile);
        } else {
          console.log("Duplicate file received, skipping");
        }
      } else {
        console.log("Invalid file format, skipping:", newFile);
      }
    } catch (err) {
      console.error("Error fetching file:", err);
    }
  }

  if (collectedFiles.length < 30) {
    throw new Error(
      "Unable to fetch 30 valid unique files after 200 attempts."
    );
  }

  return collectedFiles;
}

export default function Page() {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFiles() {
      const result = await fetchAllValidFiles();
      setFiles(result);
      setLoading(false);
    }
    loadFiles();
  }, []);

  return (
    <main className="p-4">
      {loading ? (
        <p>Loading files...</p>
      ) : (
        <pre className="whitespace-pre-wrap text-sm">
          {JSON.stringify(files, null, 2)}
        </pre>
      )}
    </main>
  );
}
