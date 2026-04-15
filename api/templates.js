// api/templates.js — Vercel Serverless Function
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ── GET /api/templates  또는  /api/templates?process_id=SYS.1
    if (req.method === "GET") {
      const { process_id } = req.query;
      let query = supabase
        .from("templates")
        .select("*")
        .order("process_id", { ascending: true })
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (process_id) {
        query = query.eq("process_id", process_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // ── POST /api/templates  (새 템플릿 등록)
    if (req.method === "POST") {
      const {
        process_id, name, version, description,
        is_default, prompt_guide, required_fields, word_sections,
      } = req.body;

      if (!process_id || !name || !prompt_guide) {
        return res.status(400).json({ error: "process_id, name, prompt_guide는 필수입니다." });
      }

      // 기본 템플릿으로 설정 시 같은 process_id의 기존 기본 템플릿 해제
      if (is_default) {
        await supabase
          .from("templates")
          .update({ is_default: false })
          .eq("process_id", process_id)
          .eq("is_default", true);
      }

      const { data, error } = await supabase
        .from("templates")
        .insert([{
          process_id,
          name,
          version: version || "1.0",
          description: description || "",
          is_default: !!is_default,
          prompt_guide,
          required_fields: required_fields || [],
          word_sections: word_sections || [],
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // ── PATCH /api/templates?id=xxx  (템플릿 수정)
    if (req.method === "PATCH") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id가 필요합니다." });

      const {
        process_id, name, version, description,
        is_default, prompt_guide, required_fields, word_sections,
      } = req.body;

      // 기본 템플릿으로 설정 시 같은 process_id의 기존 기본 템플릿 해제
      if (is_default && process_id) {
        await supabase
          .from("templates")
          .update({ is_default: false })
          .eq("process_id", process_id)
          .eq("is_default", true)
          .neq("id", id);
      }

      const updates = {};
      if (process_id !== undefined)     updates.process_id     = process_id;
      if (name !== undefined)           updates.name           = name;
      if (version !== undefined)        updates.version        = version;
      if (description !== undefined)    updates.description    = description;
      if (is_default !== undefined)     updates.is_default     = !!is_default;
      if (prompt_guide !== undefined)   updates.prompt_guide   = prompt_guide;
      if (required_fields !== undefined) updates.required_fields = required_fields;
      if (word_sections !== undefined)  updates.word_sections  = word_sections;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // ── DELETE /api/templates?id=xxx  (템플릿 삭제)
    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id가 필요합니다." });

      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "허용되지 않는 메서드입니다." });

  } catch (err) {
    console.error("[api/templates] error:", err);
    return res.status(500).json({ error: err.message || "서버 오류가 발생했습니다." });
  }
}
