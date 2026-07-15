export async function executePublishFlow(draft, steps) {
  const stable = { ...draft, id: String(draft?.id || '') };
  if (!stable.id) return { status: 'failed', stage: 'validation', error: 'ID pengumuman wajib ada.' };

  let github;
  try { github = await steps.saveStatic(stable); }
  catch (error) { github = { ok: false, error: error.message }; }
  if (!github?.ok) return { status: 'failed', stage: 'github', github };

  let dynamic;
  try { dynamic = await steps.upsertDynamic(stable); }
  catch (error) { dynamic = { ok: false, error: error.message }; }
  if (!dynamic?.ok) return { status: 'partial', stage: 'redis', github, dynamic, broadcast: null };

  if (stable.notification?.enabled !== true) {
    return { status: 'complete', stage: 'done', github, dynamic, broadcast: null };
  }

  let broadcast;
  try { broadcast = await steps.broadcast(stable); }
  catch (error) { broadcast = { ok: false, error: error.message }; }
  if (!broadcast?.ok) return { status: 'partial', stage: 'push', github, dynamic, broadcast };
  return { status: 'complete', stage: 'done', github, dynamic, broadcast };
}
