import webpush from "web-push";
import { TIMEOUT_PUSH_MS, type EnviadorPush } from "./enviar";

/** Enviador real (VAPID). Null quando as chaves não estão configuradas. */
export function enviadorWebPush(): EnviadorPush | null {
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !assunto) return null;
  webpush.setVapidDetails(assunto, publica, privada);
  return async (i, payload) => {
    await webpush.sendNotification(
      { endpoint: i.endpoint, keys: { p256dh: i.chaveP256dh, auth: i.chaveAuth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24, timeout: TIMEOUT_PUSH_MS },
    );
  };
}
