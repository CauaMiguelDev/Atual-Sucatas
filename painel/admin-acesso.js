/* Acesso do administrador do site (não a loja). Quem confere a senha é o servidor (api/login.php):
   nenhum hash vai para o navegador, e o limite de tentativas também fica lá. */
const ADMIN = (() => {
  const SESSION = 'atual_admin_sessao';
  return {
    inSession: () => sessionStorage.getItem(SESSION) === '1',
    logout() { sessionStorage.removeItem(SESSION); sessionStorage.removeItem('atual_painel_sessao'); },
    // { ok } | { error }
    async check(usuario, senha) {
      let r, j;
      try {
        r = await fetch(syncUrl('login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'admin', usuario, senha }) });
        j = await r.json();
      } catch { return { error: 'Sem conexão com o servidor. Tente de novo.' }; }
      if (!r.ok) return { error: j.error || 'Não foi possível entrar.' };
      localStorage.setItem(SYNC_KEY_STORE, j.chave);
      sessionStorage.setItem(SESSION, '1');
      return { ok: true };
    },
  };
})();
