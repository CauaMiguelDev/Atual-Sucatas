/* Administrator access (the site's developer, not the store), shared by Configurações and admin.html.
   KEY is the PBKDF2 hash of the admin password as 'salt:hash'. Safe in a public repo: it does not reveal the password.
   ponytail: client-side gate, like the panel login; real protection comes with the server. */
const ADMIN = (() => {
  const KEY = '68756103614090c5c72798ac8a40ef7a:f8212f34bc028027b9c00bab217f500a999b89e856d9e8c792c45282f4f6e7ee';
  const SESSION = 'atual_admin_sessao', LOCK = 'atual_admin_bloqueio';
  const MAX_TRIES = 5, LOCK_MS = 10 * 60 * 1000;
  const [salt, hash] = KEY.split(':');
  const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  async function derive(pw) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bytes = Uint8Array.from(salt.match(/../g).map(x => parseInt(x, 16)));
    return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes, iterations: 210000, hash: 'SHA-256' }, key, 256));
  }
  // 5 wrong passwords lock it for 10 minutes; survives reloads, cleared on a correct password
  const readLock = () => { try { return { fails: 0, until: 0, ...JSON.parse(localStorage.getItem(LOCK)) }; } catch { return { fails: 0, until: 0 }; } };
  const lockedFor = () => Math.max(0, readLock().until - Date.now());

  return {
    lockedFor,
    inSession: () => sessionStorage.getItem(SESSION) === '1',
    logout: () => sessionStorage.removeItem(SESSION),
    // { ok } | { locked } | { left: tries before the lock }
    async check(pw) {
      if (lockedFor()) return { locked: true };
      if ((await derive(pw)) === hash) {
        localStorage.removeItem(LOCK);
        sessionStorage.setItem(SESSION, '1');
        return { ok: true };
      }
      const st = readLock();
      st.fails += 1;
      if (st.fails >= MAX_TRIES) { st.fails = 0; st.until = Date.now() + LOCK_MS; }
      localStorage.setItem(LOCK, JSON.stringify(st));
      return st.until > Date.now() ? { locked: true } : { left: MAX_TRIES - st.fails };
    },
    // message for the form under the password field; '' when there is nothing to say
    message(r) {
      if (r?.locked || lockedFor()) {
        const s = Math.ceil(lockedFor() / 1000);
        return `Muitas tentativas erradas. Acesso bloqueado por ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`;
      }
      if (r?.left) return `Senha incorreta. ${r.left === 1 ? 'Resta 1 tentativa' : `Restam ${r.left} tentativas`} antes do bloqueio.`;
      return '';
    },
  };
})();
