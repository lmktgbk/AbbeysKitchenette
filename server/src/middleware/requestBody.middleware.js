import express from "express";

// Multipart images have separate limits. Ordinary API bodies never need unbounded parsing.
export function requestBodyParsers() {
  return [
    express.json({ limit: "100kb", strict: true }),
    express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 100, depth: 10 }),
  ];
}
