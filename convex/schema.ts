import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    buildFolder: v.optional(v.string()),
    ftpHost: v.string(),
    ftpUser: v.string(),
    ftpPass: v.string(),
    ftpDomain: v.string(),
    baseDir: v.string(),
    injectMode: v.string(),
    uploadMode: v.string(),
    uploadHtaccess: v.boolean(),
    buildZipId: v.optional(v.id("_storage")),
    buildZipUrl: v.optional(v.string()),
  }),
  sessions: defineTable({
    projectName: v.string(),
    startTime: v.number(),
    duration: v.number(),
  }),
  bugReports: defineTable({
    projectName: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    severity: v.string(),
    screenshotId: v.optional(v.id("_storage")),
    videoId: v.optional(v.id("_storage")),
    timestamp: v.number(),
  }),
});
