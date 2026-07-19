import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envFileArg = process.argv.find((arg) => arg.startsWith('--env-file='));
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length);
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const allowWrites = process.argv.includes('--write');

if (!url || !serviceKey || !anonKey) {
  console.error('Missing Supabase URL, service-role key, or anon key.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function errorText(error) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
}

function assertDatabaseError(error, expected, context) {
  assert(error, `${context}: expected the database to reject the operation`);
  assert(
    errorText(error).includes(expected),
    `${context}: expected ${expected}, received ${errorText(error)}`,
  );
}

async function loadState() {
  const [{ data: root, error: rootError }, { data: versions, error: versionsError }] = await Promise.all([
    admin.from('organization_settings').select('*').eq('id', 'primary').single(),
    admin
      .from('organization_setting_versions')
      .select('*')
      .eq('organizationId', 'primary')
      .order('versionNumber', { ascending: false }),
  ]);

  if (rootError) throw rootError;
  if (versionsError) throw versionsError;
  return { root, versions };
}

async function verifyReadState() {
  const { root, versions } = await loadState();
  const published = versions.filter((row) => row.status === 'published');
  const drafts = versions.filter((row) => row.status === 'draft');

  assert(root.id === 'primary', 'Organization root is missing.');
  assert(root.publishedVersionId, 'Organization root has no published version pointer.');
  assert(published.length === 1, `Expected one published version, found ${published.length}.`);
  assert(published[0].id === root.publishedVersionId, 'Published pointer does not match the published row.');
  assert(drafts.length <= 1, `Expected at most one draft, found ${drafts.length}.`);

  for (const table of ['organization_settings', 'organization_setting_versions']) {
    const { data, error } = await anon.from(table).select('id').limit(1);
    assert(error || data?.length === 0, `Anonymous client can read ${table}.`);
  }

  const { error: anonRpcError } = await anon.rpc('create_organization_settings_draft', {
    p_draft_id: `organization-anon-probe-${randomUUID()}`,
    p_actor_id: 'anonymous-probe',
    p_actor_name: 'Anonymous probe',
    p_actor_role: 'anon',
  });
  assert(anonRpcError, 'Anonymous client can execute the draft RPC.');

  console.log(
    `READ_OK published=v${published[0].versionNumber} versions=${versions.length} drafts=${drafts.length} rls=protected`,
  );
  return { root, versions, published: published[0], drafts };
}

async function verifyWriteLifecycle(initial) {
  assert(initial.drafts.length === 0, 'A real draft already exists; write verification stopped without changes.');

  const draftId = `organization-uat-draft-${randomUUID()}`;
  const actor = {
    id: 'phase4a-uat',
    name: 'Phase 4A UAT',
    role: 'system-test',
  };
  let created = false;

  try {
    const { data: draft, error: createError } = await admin.rpc('create_organization_settings_draft', {
      p_draft_id: draftId,
      p_actor_id: actor.id,
      p_actor_name: actor.name,
      p_actor_role: actor.role,
    });
    if (createError) throw createError;
    created = true;

    assert(draft.status === 'draft', 'Draft RPC did not return a draft.');
    assert(draft.baseVersionId === initial.published.id, 'Draft base version is not the current published version.');
    assert(
      draft.versionNumber === Math.max(...initial.versions.map((row) => row.versionNumber)) + 1,
      'Draft version number is not sequential.',
    );

    const { error: invalidError } = await admin
      .from('organization_setting_versions')
      .update({ taxId: '123' })
      .eq('id', draftId);
    assert(invalidError, 'Invalid tax ID update unexpectedly succeeded.');

    const { data: afterInvalid, error: afterInvalidError } = await admin
      .from('organization_setting_versions')
      .select('*')
      .eq('id', draftId)
      .single();
    if (afterInvalidError) throw afterInvalidError;
    assert(afterInvalid.taxId === draft.taxId, 'Invalid update changed the draft.');

    const changeNote = `Phase 4A database UAT ${new Date().toISOString()}`;
    const updatedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from('organization_setting_versions')
      .update({
        changeNote,
        updatedById: actor.id,
        updatedByName: actor.name,
        updatedByRole: actor.role,
        updatedAt,
      })
      .eq('id', draftId)
      .eq('status', 'draft')
      .eq('updatedAt', draft.updatedAt)
      .select('*')
      .single();
    if (updateError) throw updateError;
    assert(updated.changeNote === changeNote, 'Valid draft update was not persisted.');

    const { data: staleRows, error: staleUpdateError } = await admin
      .from('organization_setting_versions')
      .update({ phone: 'stale-write-must-not-land' })
      .eq('id', draftId)
      .eq('status', 'draft')
      .eq('updatedAt', draft.updatedAt)
      .select('id');
    if (staleUpdateError) throw staleUpdateError;
    assert(staleRows.length === 0, 'Stale optimistic update changed the draft.');

    const { error: stalePublishError } = await admin.rpc(
      'publish_organization_settings_draft_atomic',
      {
        p_version_id: draftId,
        p_expected_updated_at: draft.updatedAt,
        p_actor_id: actor.id,
        p_actor_name: actor.name,
        p_actor_role: actor.role,
      },
    );
    assertDatabaseError(stalePublishError, 'organization_settings_draft_stale', 'Stale publish');

    const afterStalePublish = await loadState();
    assert(
      afterStalePublish.root.publishedVersionId === initial.root.publishedVersionId,
      'Failed publish changed the published pointer.',
    );
    assert(
      afterStalePublish.versions.filter((row) => row.status === 'published').length === 1,
      'Failed publish changed the published row count.',
    );

    const currentDraft = afterStalePublish.versions.find((row) => row.id === draftId);
    assert(currentDraft?.status === 'draft', 'Failed publish changed the draft lifecycle state.');

    const { data: archived, error: archiveError } = await admin.rpc(
      'archive_organization_settings_draft_atomic',
      {
        p_version_id: draftId,
        p_expected_updated_at: currentDraft.updatedAt,
        p_actor_id: actor.id,
        p_actor_name: actor.name,
        p_actor_role: actor.role,
      },
    );
    if (archiveError) throw archiveError;
    assert(archived.status === 'archived', 'Archive RPC did not return an archived version.');

    const { error: immutableError } = await admin
      .from('organization_setting_versions')
      .update({ changeNote: 'must-not-change' })
      .eq('id', draftId);
    assertDatabaseError(
      immutableError,
      'organization_setting_version_archived_immutable',
      'Archived immutability',
    );

    const { error: deleteError } = await admin
      .from('organization_setting_versions')
      .delete()
      .eq('id', draftId);
    assertDatabaseError(
      deleteError,
      'organization_setting_version_delete_forbidden',
      'Version deletion guard',
    );

    const finalState = await loadState();
    assert(finalState.root.publishedVersionId === initial.root.publishedVersionId, 'UAT changed Published.');
    assert(!finalState.versions.some((row) => row.status === 'draft'), 'UAT left a draft behind.');
    assert(
      finalState.versions.some((row) => row.id === draftId && row.status === 'archived'),
      'Archived UAT evidence is missing.',
    );

    console.log(`WRITE_OK draft=${draftId} final=archived published=unchanged`);
  } finally {
    if (!created) return;

    const { data: remaining } = await admin
      .from('organization_setting_versions')
      .select('id,status,updatedAt')
      .eq('id', draftId)
      .maybeSingle();

    if (remaining?.status === 'draft') {
      const { error: cleanupError } = await admin.rpc(
        'archive_organization_settings_draft_atomic',
        {
          p_version_id: draftId,
          p_expected_updated_at: remaining.updatedAt,
          p_actor_id: actor.id,
          p_actor_name: actor.name,
          p_actor_role: actor.role,
        },
      );
      if (cleanupError) {
        console.error(`CLEANUP_FAILED draft=${draftId} ${errorText(cleanupError)}`);
      } else {
        console.log(`CLEANUP_OK draft=${draftId} final=archived`);
      }
    }
  }
}

const initial = await verifyReadState();
if (allowWrites) {
  await verifyWriteLifecycle(initial);
} else {
  console.log('Write lifecycle skipped. Pass --write to create and archive a disposable UAT draft.');
}
