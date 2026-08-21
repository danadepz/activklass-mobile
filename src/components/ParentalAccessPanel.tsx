import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/AuthContext';
import type { GuardianScopes } from '../lib/parent';
import {
  GuardianLinkDoc,
  SCOPE_LABELS,
  ALL_SCOPES_ON,
  approveGuardianLink,
  canManageOwnLinks,
  ensureMyGuardianCode,
  getDefaultScopes,
  setDefaultScopes,
  listMyGuardians,
  revokeGuardianLink,
  rotateMyGuardianCode,
  setGuardianLinkScopes,
} from '../lib/guardianCodes';
import { useThemeColors } from '../theme';

/**
 * The student's parental-access controls: share code, per-guardian visibility
 * toggles, and the connected-guardian list with approve and revoke.
 *
 * Reads and writes Firestore directly. It used to go through the Flask API,
 * which kept the codes in Postgres — but a guardian has no account when they
 * type a code, so nothing unauthenticated could check one, and an invalid code
 * was only caught after the guardian had already registered. The code lives in
 * Firestore now (src/lib/guardianCodes.ts explains the document shape).
 *
 * The age gate is unchanged and still decided outside this component: under-18
 * students see the controls DISABLED with the reason rather than hidden, since
 * hiding them would leave a minor unable to see who is watching. What actually
 * enforces it is firestore.rules, not this file.
 */
export default function ParentalAccessPanel() {
  const c = useThemeColors();
  const { profile } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<GuardianLinkDoc[]>([]);
  /* What approving a guardian grants. Held on the code document because it is
     the only thing a student owns before any guardian exists. */
  const [defaults, setDefaults] = useState<GuardianScopes>(ALL_SCOPES_ON);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An unknown birthdate takes the adult path: the student consents for
  // themselves. Treating unknown as "minor" would unlock a guardian with
  // nobody having agreed to it.
  const canManage = canManageOwnLinks(profile?.birthdate);

  const load = useCallback(async () => {
    try {
      // The code resolves first: the defaults live on that document.
      const issued = await ensureMyGuardianCode();
      const [links, scopes] = await Promise.all([listMyGuardians(), getDefaultScopes(issued)]);
      setCode(issued);
      setGuardians(links);
      setDefaults(scopes);
      setError(null);
    } catch (err: any) {
      setError(
        err?.code === 'permission-denied'
          ? 'Could not load your parental access settings. Your account may not have student access yet.'
          : 'Could not load your parental access settings. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', 'Your code is on the clipboard — send it to your guardian.');
  };

  const handleRotate = () => {
    Alert.alert(
      'Generate a new code?',
      'Anyone still holding your old code will not be able to use it. Guardians already connected stay connected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          style: 'destructive',
          onPress: async () => {
            setBusy('rotate');
            try {
              setCode(await rotateMyGuardianCode());
            } catch {
              Alert.alert('Could not regenerate', 'Please check your connection and try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const handleToggle = async (link: GuardianLinkDoc, key: keyof GuardianScopes, value: boolean) => {
    setBusy(link.link_id);
    const next = { ...link.scopes, [key]: value };
    // Optimistic: the switch should not lag behind the finger.
    setGuardians((list) =>
      list.map((g) => (g.link_id === link.link_id ? { ...g, scopes: next } : g))
    );
    try {
      await setGuardianLinkScopes(link.link_id, next);
    } catch {
      Alert.alert('Could not update', 'That change did not save. Please try again.');
      load(); // put the switch back where the server says it is
    } finally {
      setBusy(null);
    }
  };

  const handleDefaultToggle = async (key: keyof GuardianScopes, value: boolean) => {
    if (!code) return;
    const next = { ...defaults, [key]: value };
    setDefaults(next); // optimistic: the switch should not lag the finger
    setBusy('defaults');
    try {
      await setDefaultScopes(code, next);
    } catch {
      Alert.alert('Could not update', 'That change did not save. Please try again.');
      load();
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (link: GuardianLinkDoc) => {
    setBusy(link.link_id);
    try {
      // Grant what the student chose up front, not everything.
      await approveGuardianLink(link.link_id, defaults);
      await load();
    } catch {
      Alert.alert('Could not approve', 'Please check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = (link: GuardianLinkDoc) => {
    Alert.alert(
      'Remove this guardian?',
      `${link.guardian_name ?? 'This guardian'} will immediately lose access to your records. They can reconnect only with a new code from you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(link.link_id);
            try {
              await revokeGuardianLink(link.link_id);
              await load();
            } catch {
              Alert.alert('Could not remove', 'Please check your connection and try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View className="bg-surface border border-hairline rounded-2xl p-8 items-center">
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="bg-surface border border-hairline rounded-2xl p-5">
        <Text className="text-danger text-xs leading-relaxed">{error}</Text>
        <TouchableOpacity
          onPress={load}
          className="mt-4 px-4 py-2 border border-hairline bg-sunken rounded-xl self-start"
        >
          <Text className="text-ink-muted text-xs font-semibold">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="bg-surface border border-hairline rounded-2xl p-5">
      {!canManage ? (
        <Text className="text-ink-muted text-xs leading-normal bg-sunken p-4 rounded-xl border border-hairline mb-5">
          ℹ️ Students under 18 cannot change guardian access. Your guardian keeps access while you
          are a minor. Ask your teacher or school admin if something needs to change.
        </Text>
      ) : (
        <Text className="text-ink-muted text-xs leading-normal bg-sunken p-4 rounded-xl border border-hairline mb-5">
          🔒 You decide who sees your records and what they see. Share your code to connect a
          guardian, then turn individual sections on or off below.
        </Text>
      )}

      {/* Share code */}
      <View className="bg-sunken border border-hairline p-4 rounded-xl items-center">
        <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">
          Your Connection Code
        </Text>
        <Text className="text-accent-text text-3xl font-black font-mono tracking-[6px] mt-2">
          {code ?? '——————'}
        </Text>
        <Text className="text-ink-faint text-[10px] text-center mt-2 leading-relaxed px-4">
          Give this to your guardian. They enter it in the ActivKlass parent app to connect.
        </Text>
        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity onPress={copyCode} className="px-4 py-2 bg-accent rounded-xl">
            <Text className="text-on-accent text-xs font-bold">Copy Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRotate}
            disabled={busy === 'rotate'}
            className="px-4 py-2 border border-hairline bg-surface rounded-xl"
          >
            {busy === 'rotate' ? (
              <ActivityIndicator size="small" color="#94a3b8" />
            ) : (
              <Text className="text-ink-muted text-xs font-semibold">New Code</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Only while nobody is connected. Once a guardian exists they carry
          their own four below, and a second identical set here is the same
          question asked twice with different answers. The stored defaults
          still apply when a later guardian is approved. */}
      {guardians.length === 0 && (
        <>
<Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-6 mb-1">
        What guardians can see
      </Text>
      <Text className="text-ink-faint text-[11px] leading-relaxed mb-3">
        {canManage
          ? 'Applied when you approve a new guardian. Nobody sees anything until you approve them, and each guardian can be changed individually below.'
          : 'These are managed for you and cannot be changed here.'}
      </Text>
      <View className="bg-sunken border border-hairline rounded-xl px-4 py-1">
        {SCOPE_LABELS.map(({ key, label }) => (
          <View key={key} className="flex-row justify-between items-center py-2.5">
            <Text className="text-ink-soft text-xs flex-1 pr-3">{label}</Text>
            <Switch
              value={!!defaults[key]}
              onValueChange={(v) => handleDefaultToggle(key, v)}
              disabled={!canManage || busy === 'defaults'}
              trackColor={{ false: c.track, true: c.accent }}
              thumbColor={c.surface}
            />
          </View>
        ))}
      </View>
        </>
      )}

      {/* Connected guardians */}
      <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-6 mb-3">
        Connected Guardians ({guardians.length})
      </Text>

      {guardians.length === 0 ? (
        <View className="bg-sunken border border-hairline p-5 rounded-xl items-center">
          <Text className="text-ink-faint text-xs text-center">
            Nobody is connected yet. Share your code above to connect a guardian.
          </Text>
        </View>
      ) : (
        guardians.map((link) => (
          <View key={link.link_id} className="bg-sunken border border-hairline p-4 rounded-xl mb-3">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="text-ink text-sm font-bold">
                  {link.guardian_name || link.guardian_email || 'Guardian'}
                </Text>
                <Text className="text-ink-faint text-[10px] mt-1">
                  {link.relationship_type ? `${link.relationship_type} · ` : ''}
                  {link.guardian_email ?? ''}
                </Text>
              </View>
              {link.status === 'approved' ? (
                <Text className="text-success text-[10px] font-bold uppercase">Approved</Text>
              ) : (
                <Text className="text-warning text-[10px] font-bold uppercase">Pending</Text>
              )}
            </View>

            {link.status !== 'approved' && canManage && (
              <TouchableOpacity
                onPress={() => handleApprove(link)}
                disabled={busy === link.link_id}
                className="bg-accent py-3 rounded-xl items-center justify-center mt-4"
              >
                {busy === link.link_id ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-on-accent text-xs font-bold">Approve this guardian</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Toggles stay visible while pending so a student can see exactly
                what approving would hand over. */}
            <View className="mt-4">
              {SCOPE_LABELS.map(({ key, label }) => (
                <View key={key} className="flex-row justify-between items-center py-2">
                  <Text
                    className={`text-xs ${
                      link.status === 'approved' ? 'text-ink-soft' : 'text-ink-faint'
                    }`}
                  >
                    {label}
                  </Text>
                  <Switch
                    value={!!link.scopes[key]}
                    onValueChange={(v) => handleToggle(link, key, v)}
                    disabled={!canManage || link.status !== 'approved' || busy === link.link_id}
                    trackColor={{ false: c.track, true: c.accent }}
                    thumbColor={c.surface}
                  />
                </View>
              ))}
            </View>

            {canManage && (
              <TouchableOpacity
                onPress={() => handleRevoke(link)}
                disabled={busy === link.link_id}
                className="border border-red-500/30 bg-red-500/5 py-3 rounded-xl items-center justify-center mt-3"
              >
                <Text className="text-danger text-xs font-bold">Remove guardian</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}
