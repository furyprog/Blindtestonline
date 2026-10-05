// verifier-liens.mjs - Vérifie les liens YouTube de titres.json (Node 18 ou plus)
// Application développée par Thierry ROUSSEL
// Avec la variable YOUTUBE_API_KEY : API YouTube Data (existence, intégration, blocage par pays, durée).
// Sans clé : point d'accès oEmbed (existence et intégration seulement).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const attendre = ms => new Promise(r => setTimeout(r, ms));
const duree = iso => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };

export async function verifierApi(titres, cle, f = fetch, pays = 'FR', dureeMin = 30) {
  const problemes = [];
  for (let i = 0; i < titres.length; i += 50) {
    const lot = titres.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&maxResults=50&id=${lot.map(t => t.vid).join(',')}&key=${cle}`;
    const r = await f(url);
    if (!r.ok) throw new Error(`API YouTube : HTTP ${r.status}`);
    const j = await r.json(); const par = new Map((j.items || []).map(x => [x.id, x]));
    for (const t of lot) {
      const v = par.get(t.vid); let p = null;
      if (!v) p = 'Introuvable (supprimée ou privée)';
      else if (v.status?.privacyStatus === 'private') p = 'Privée';
      else if (v.status?.embeddable === false) p = 'Intégration désactivée';
      else {
        const rr = v.contentDetails?.regionRestriction;
        if (rr?.blocked?.includes(pays)) p = `Bloquée en ${pays}`;
        else if (rr?.allowed && !rr.allowed.includes(pays)) p = `Non autorisée en ${pays}`;
        else if (v.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') p = "Restriction d'âge";
        else { const d = duree(v.contentDetails?.duration); if (d !== null && d < dureeMin) p = `Durée très courte (${d} s)`; }
      }
      if (p) problemes.push({ ...t, probleme: p });
    }
  }
  return { problemes, indetermines: [], mode: 'API YouTube Data' };
}

export async function verifierOembed(titres, f = fetch, simultanes = 4, pause = 150) {
  const problemes = [], indetermines = []; let i = 0;
  async function un(t) {
    for (let essai = 0; essai < 3; essai++) {
      try {
        const r = await f(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + t.vid)}`);
        if (r.status === 200) return;
        if (r.status === 404) { problemes.push({ ...t, probleme: 'Introuvable (supprimée ou privée)' }); return; }
        if (r.status === 401) { problemes.push({ ...t, probleme: 'Intégration désactivée' }); return; }
      } catch { /* erreur réseau : on réessaie */ }
      await attendre(1500 * (essai + 1));
    }
    indetermines.push(t);
  }
  await Promise.all(Array.from({ length: simultanes }, async () => { while (i < titres.length) { await un(titres[i++]); await attendre(pause); } }));
  return { problemes, indetermines, mode: 'oEmbed (sans clé API : blocages par pays non détectés)' };
}

export function rapport(titres, res) {
  const esc = s => String(s ?? '').replace(/\|/g, '\\|');
  const tri = [...res.problemes].sort((a, b) => a.probleme.localeCompare(b.probleme) || String(a.artist).localeCompare(String(b.artist)));
  const L = [`Contrôle du ${new Date().toLocaleDateString('fr-FR')} · ${titres.length} liens · méthode : ${res.mode}`, ''];
  L.push(`**${res.problemes.length} lien(s) à vérifier**` + (res.indetermines.length ? ` · ${res.indetermines.length} contrôle(s) indéterminé(s) (erreur réseau ou limitation de YouTube)` : ''), '');
  if (tri.length) {
    L.push('| Problème | Artiste | Titre | Lien | id |', '|---|---|---|---|---|');
    for (const t of tri) L.push(`| ${esc(t.probleme)} | ${esc(t.artist)} | ${esc(t.title)} | https://www.youtube.com/watch?v=${t.vid} | ${esc(t.id)} |`);
  }
  L.push('', "Pour remplacer un lien : modifier l'Excel (outil TelechargerLiensMP3), relancer MesurerVolumes (il ne remesure que les liens changés), puis ExcelVersTitresJson, et mettre en ligne titres.json.");
  return L.join('\n');
}

async function main() {
  const titres = JSON.parse(readFileSync(process.argv[2] || 'titres.json', 'utf8')).filter(t => t.vid);
  const cle = process.env.YOUTUBE_API_KEY; let res;
  if (cle) {
    try { res = await verifierApi(titres, cle); }
    catch (e) { res = await verifierOembed(titres); res.mode += ` · repli, la clé API a échoué (${e.message})`; }
  } else res = await verifierOembed(titres);
  if (res.indetermines.length > titres.length * 0.3) res.mode += ' · CONTRÔLE INCOMPLET (trop de réponses indéterminées)';
  writeFileSync('rapport-liens.md', rapport(titres, res), 'utf8');
  // Version courte (texte brut) pour la notification par e-mail
  const court = res.problemes.slice(0, 15).map(x => `- ${x.artist} - ${x.title} : ${x.probleme} : https://youtu.be/${x.vid}`);
  if (res.problemes.length > 15) court.push(`... et ${res.problemes.length - 15} autre(s) (voir le ticket sur GitHub)`);
  writeFileSync('rapport-court.txt', `${res.problemes.length} lien(s) YouTube à vérifier (contrôle du ${new Date().toLocaleDateString('fr-FR')}) :\n` + court.join('\n'), 'utf8');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `casses=${res.problemes.length}\n`);
  console.log(`${titres.length} liens contrôlés (${res.mode}) : ${res.problemes.length} à vérifier, ${res.indetermines.length} indéterminés.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
