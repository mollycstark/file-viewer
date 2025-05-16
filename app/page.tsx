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

type TreeNode = {
  name: string;
  path?: string;
  children?: TreeNode[];
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
          f.metadata.created_at.length > 0 &&
          typeof f.metadata.checksum === "string" &&
          f.metadata.checksum.length > 0
      ),
    };

    try {
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

async function fetchHint(files: FileTreeNode[]): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/hint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ files }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Hint API failed: ${res.status} ${errorText}`);
  }

  return await res.text();
}

function deriveHiddenKey(files: FileTreeNode[]): string {
  return files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => file.path[1])
    .join("");
}

function buildFileTree(files: FileTreeNode[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    parts.forEach((part, idx) => {
      const existing = currentLevel.find((node) => node.name === part);
      if (existing) {
        if (!existing.children) existing.children = [];
        currentLevel = existing.children;
      } else {
        const newNode: TreeNode = { name: part };
        if (idx === parts.length - 1) {
          newNode.path = file.path;
        } else {
          newNode.children = [];
        }
        currentLevel.push(newNode);
        currentLevel = newNode.children ?? [];
      }
    });
  }

  return root;
}

function FileTree({
  nodes,
  onSelect,
  selected,
}: {
  nodes: TreeNode[];
  onSelect: (path: string) => void;
  selected: string | null;
}) {
  return (
    <ul className="pl-4">
      {nodes.map((node) => (
        <li key={node.name}>
          <div
            className={`cursor-pointer ${
              selected === node.path ? "font-bold text-blue-600" : ""
            }`}
            onClick={() => node.path && onSelect(node.path)}
          >
            {node.name}
          </div>
          {node.children && (
            <FileTree
              nodes={node.children}
              onSelect={onSelect}
              selected={selected}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Page() {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);

  const tree = buildFileTree(files);

  useEffect(() => {
    async function loadFiles() {
      const result = await fetchAllValidFiles();
      setFiles(result);
      setLoading(false);

      try {
        const hint = await fetchHint(result);
        console.log("Hint received:", hint);

        const hidden = deriveHiddenKey(result);
        setHiddenKey(hidden);
        console.log("Derived hidden key:", hidden);
      } catch (err) {
        console.error("Error during hint/key logic:", err);
      }
    }

    loadFiles();
  }, []);

  useEffect(() => {
    if (!selectedPath || !hiddenKey) return;

    console.log("Fetching CDN URL for:", selectedPath);

    async function fetchImage() {
      try {
        const cdnRes = await fetch(`${BASE_URL}/api/cdn?path=${selectedPath}`, {
          headers: {
            "X-API-Key": API_KEY,
            "X-Hidden-Key": hiddenKey,
          },
        });

        if (!cdnRes.ok) throw new Error("CDN fetch failed");
        const cdnUrl = await cdnRes.text(); // This is the .txt file URL

        const base64Res = await fetch(cdnUrl);
        if (!base64Res.ok) throw new Error("Base64 image fetch failed");
        const base64 = await base64Res.text();

        // Convert to data URI
        const imageSrc = `data:image/png;base64,${base64}`;
        setImageUrl(imageSrc);
      } catch (err) {
        console.error("Failed to fetch image:", err);
        setImageUrl(null);
      }
    }

    fetchImage();
  }, [selectedPath, hiddenKey]);

  console.log("Selected path:", selectedPath);
  console.log("Hidden key:", hiddenKey);
  console.log("Image URL:", imageUrl);

  return (
    <main className="p-4 flex gap-8">
      {loading ? (
        <p>Loading files...</p>
      ) : (
        <>
          <div className="w-1/2 overflow-auto border-r pr-4">
            <FileTree
              nodes={tree}
              onSelect={setSelectedPath}
              selected={selectedPath}
            />
          </div>
          <div className="w-1/2">
            {selectedPath && imageUrl ? (
              <img src={imageUrl} alt={selectedPath} className="max-w-full" />
            ) : (
              <p>Select a file to preview the image</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
