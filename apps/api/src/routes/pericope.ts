import express from "express";
import {
  searchPericopesByQuery,
  getPericopeById,
  getPericopeForVerse,
} from "../bible/pericopeSearch";
import { buildPericopeBundle } from "../bible/pericopeGraphWalker";
import { supabase } from "../db";

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

router.get("/verse/:verseId", async (req, res) => {
  try {
    const verseId = Number(req.params.verseId);
    if (!Number.isFinite(verseId)) {
      return res.status(400).json({ error: "Invalid verse id" });
    }

    const source =
      typeof req.query.source === "string" ? req.query.source : "SBL";
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
