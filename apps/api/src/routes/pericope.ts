import express from "express";
import {
  searchPericopesByQuery,
  getPericopeById,
  getPericopeForVerse,
} from "../bible/pericopeSearch";
import { buildPericopeBundle } from "../bible/pericopeGraphWalker";
import { supabase } from "../db";
import { ENV } from "../env";

const router = express.Router();

router.post("/search", async (req, res) => {
  try {
    const { query, limit, threshold, testament, pericopeType } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query required" });
    }

    const results = await searchPericopesByQuery(query, {
      limit,
      similarityThreshold: threshold,
    });

    if (!testament && !pericopeType) {
      return res.json({ results });
    }

    const ids = results.map((result) => result.id);
    if (ids.length === 0) return res.json({ results: [] });

    const { data, error } = await supabase
      .from("pericopes")
      .select("id, testament, pericope_type")
      .in("id", ids);

    if (error || !data) {
      return res.json({ results });
    }

    const metadata = new Map(
      data.map((row) => [
        row.id,
        { testament: row.testament, pericope_type: row.pericope_type },
      ]),
    );

    const filtered = results.filter((result) => {
      const meta = metadata.get(result.id);
      if (!meta) return false;
      if (testament && meta.testament !== testament) return false;
      if (pericopeType && meta.pericope_type !== pericopeType) return false;
      return true;
    });

    return res.json({ results: filtered });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/random", async (req, res) => {
  try {
    const source =
      typeof req.query.source === "string"
        ? req.query.source
        : ENV.PERICOPE_SOURCE || "SIL_AI";
    const testament =
      typeof req.query.testament === "string"
        ? req.query.testament.toUpperCase()
        : null;

    if (testament && testament !== "OT" && testament !== "NT") {
      return res.status(400).json({ error: "Invalid testament filter" });
    }

    let countQuery = supabase
      .from("pericopes")
      .select("id", { count: "exact", head: true })
      .eq("source", source);

    if (testament) {
      countQuery = countQuery.eq("testament", testament);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return res.status(500).json({
        error: "Failed to load pericope count",
        details: countError.message,
      });
    }

    const total = count ?? 0;
    if (total === 0) {
      return res.status(404).json({ error: "No pericopes available" });
    }

    const offset = Math.floor(Math.random() * total);
    let pericopeQuery = supabase
      .from("pericopes")
      .select("id")
      .eq("source", source)
      .range(offset, offset);

    if (testament) {
      pericopeQuery = pericopeQuery.eq("testament", testament);
    }

    const { data, error: pericopeError } = await pericopeQuery;

    if (pericopeError || !data || data.length === 0) {
      return res.status(404).json({ error: "No pericope found" });
    }

    const pericope = await getPericopeById(data[0].id);
    if (!pericope) {
      return res.status(404).json({ error: "Pericope not found" });
    }

    const title =
      pericope.title_generated && pericope.title_generated.trim().length > 0
        ? pericope.title_generated.trim()
        : pericope.title;
    const prompt = `Study ${pericope.rangeRef} - ${title}`;

    return res.json({
      pericopeId: pericope.id,
      title,
      rangeRef: pericope.rangeRef,
      prompt,
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/verse/:verseId", async (req, res) => {
  try {
    const verseId = Number(req.params.verseId);
    if (!Number.isFinite(verseId)) {
      return res.status(400).json({ error: "Invalid verse id" });
    }

    const source =
      typeof req.query.source === "string"
        ? req.query.source
        : ENV.PERICOPE_SOURCE || "SIL_AI";
    const pericope = await getPericopeForVerse(verseId, source);

    if (!pericope) {
      return res
        .status(404)
        .json({ error: "No pericope found for this verse" });
    }

    return res.json(pericope);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const defaultSource = ENV.PERICOPE_SOURCE || "SIL_AI";
    const [
      { count: pericopesTotal, error: pericopeError },
      { count: embeddingsTotal, error: embeddingsError },
      { count: connectionsTotal, error: connectionsError },
      { count: mapTotal, error: mapError },
      { count: silAiCount, error: silAiError },
      { count: sblCount, error: sblError },
    ] = await Promise.all([
      supabase.from("pericopes").select("id", { count: "exact", head: true }),
      supabase
        .from("pericope_embeddings")
        .select("pericope_id", { count: "exact", head: true })
        .eq("embedding_type", "full_text"),
      supabase
        .from("pericope_connections")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("verse_pericope_map")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("pericopes")
        .select("id", { count: "exact", head: true })
        .eq("source", "SIL_AI"),
      supabase
        .from("pericopes")
        .select("id", { count: "exact", head: true })
        .eq("source", "SBL"),
    ]);

    if (
      pericopeError ||
      embeddingsError ||
      connectionsError ||
      mapError ||
      silAiError ||
      sblError
    ) {
      return res.status(500).json({
        error: "Failed to load pericope status",
        details:
          pericopeError?.message ||
          embeddingsError?.message ||
          connectionsError?.message ||
          mapError?.message ||
          silAiError?.message ||
          sblError?.message,
      });
    }

    return res.json({
      defaultSource,
      pericopesTotal: pericopesTotal ?? 0,
      pericopesBySource: {
        SIL_AI: silAiCount ?? 0,
        SBL: sblCount ?? 0,
      },
      embeddingsTotal: embeddingsTotal ?? 0,
      connectionsTotal: connectionsTotal ?? 0,
      verseMapTotal: mapTotal ?? 0,
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid pericope id" });
    }

    const pericope = await getPericopeById(id);
    if (!pericope) {
      return res.status(404).json({ error: "Pericope not found" });
    }

    return res.json(pericope);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/genealogy", async (req, res) => {
  try {
    const { pericopeId, ringConfig } = req.body;
    if (!pericopeId) {
      return res.status(400).json({ error: "pericopeId required" });
    }

    const bundle = await buildPericopeBundle(Number(pericopeId), ringConfig);
    if (!bundle) {
      return res.status(404).json({ error: "Pericope not found" });
    }

    return res.json(bundle);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
