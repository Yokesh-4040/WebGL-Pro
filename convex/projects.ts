import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
  },
});

export const add = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    if (existing) {
      throw new Error(`Project with name "${args.name}" already exists.`);
    }
    return await ctx.db.insert("projects", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
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
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch(id, data);
  },
});

export const updateZip = mutation({
  args: {
    id: v.id("projects"),
    buildZipId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const buildZipUrl = args.buildZipId
      ? await ctx.storage.getUrl(args.buildZipId)
      : undefined;
    await ctx.db.patch(args.id, {
      buildZipId: args.buildZipId,
      buildZipUrl: buildZipUrl || undefined,
    });
    return { buildZipUrl };
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
