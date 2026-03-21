/**
 * ZyraHost — Cloudflare Worker
 * Proxy pour l'API IONOS Domain (sans CORS, sans PHP)
 *
 * DÉPLOIEMENT :
 * 1. Va sur https://workers.cloudflare.com
 * 2. Crée un nouveau Worker
 * 3. Colle ce code
 * 4. Dans "Settings > Variables", ajoute :
 *    - IONOS_API_KEY  →  ta clé API IONOS (Public Prefix + . + Secret)
 * 5. Note l'URL de ton worker : https://zyrahost-proxy.TON-COMPTE.workers.dev
 * 6. Remplace WORKER_URL dans le HTML par cette URL
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",          // ou "https://ton-org.github.io"
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── Route : /check?domain=monsite.zyrahost.fr ──
    if (url.pathname === "/check") {
      const domain = url.searchParams.get("domain");
      if (!domain) {
        return json({ error: "Paramètre 'domain' manquant" }, 400);
      }

      try {
        const res = await fetch(
          `https://api.hosting.ionos.com/dns/v1/zones`,
          {
            headers: {
              "X-API-Key": env.IONOS_API_KEY,
              "Accept": "application/json",
            },
          }
        );

        if (!res.ok) {
          return json({ error: "Erreur API IONOS", status: res.status }, 502);
        }

        const zones = await res.json();
        // Vérifie si le sous-domaine est déjà pris parmi les zones existantes
        const taken = zones.some(z =>
          z.name === domain || z.name.startsWith(domain.split(".")[0] + ".")
        );

        return json({ domain, available: !taken });

      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── Route : /deploy  (optionnel — pour créer le DNS record) ──
    // POST body: { subdomain: "monsite", ip: "185.x.x.x" }
    if (url.pathname === "/deploy" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body?.subdomain) return json({ error: "subdomain requis" }, 400);

      const ZONE_ID = env.IONOS_ZONE_ID;   // ID de ta zone zyrahost.fr dans IONOS
      const TARGET_IP = env.TARGET_IP;      // IP de ton hébergement GitHub Pages / CDN

      const record = {
        name: body.subdomain,
        type: "A",
        content: TARGET_IP,
        ttl: 3600,
        prio: 0,
        disabled: false,
      };

      const res = await fetch(
        `https://api.hosting.ionos.com/dns/v1/zones/${ZONE_ID}/records`,
        {
          method: "POST",
          headers: {
            "X-API-Key": env.IONOS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([record]),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        return json({ error: "Erreur création DNS", detail: err }, 502);
      }

      return json({ success: true, subdomain: `${body.subdomain}.zyrahost.fr` });
    }

    return json({ error: "Route inconnue. Utilise /check ou /deploy" }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}
