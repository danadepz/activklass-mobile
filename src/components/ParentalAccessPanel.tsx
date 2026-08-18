import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { errorMessage } from '../lib/api';
import {
  GuardianLink,
  GuardianScopes,
  MyGuardiansPayload,
  approveGuardian,
  getMyGuardianCode,
  getMyGuardians,
  revokeGuardian,
  rotateMyGuardianCode,
  setGuardianScopes,
} from '../lib/parent';

/**
 * The student's parental-access controls: share code, per-guardian visibility
 * toggles, and the connected-guardian list with a revoke button.
 *
 * Every decision here belongs to the backend. The old version generated its own
 * code ('AK' + random digits) and set its own is_minor from a client-side age
 * field — a student could edit their age to control the consent gate. Now the
 * code comes from /api/guardian-links/code and `can_manage` (derived from the
 * birthdate server-side) says whether the controls are editable at all.
 *
 * Under-18 students see the controls DISABLED with the reason, rather than not
 * at all: hiding them would leave a minor unable to see who is watching.
 */
export default function ParentalAccessPanel() {
  const [code, setCode] = useState<string | null>(null);
  const [data, setData] = useState<MyGuardiansPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [codeRes, guardians] = await Promise.all([getMyGuardianCode(), getMyGuardians()]);
      setCode(codeRes.code);
      setData(guardians);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your parental access settings.'));
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
              setCode((await rotateMyGuardianCode()).code);
            } catch (err) {
              Alert.alert('Could not regenerate', errorMessage(err));
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const handleToggle = async (link: GuardianLink, key: keyof GuardianScopes, value: boolean) => {
    setBusy(link.id);
    // Optimistic: the switch should not lag behind the finger.
    setData((d) =>
      d
        ? {
            ...d,
            guardians: d.guardians.map((g) =>
              g.id === link.id ? { ...g, scopes: { ...g.scopes, [key]: value } } : g
            ),
          }
        : d
    );
    try {
      await setGuardianScopes(link.id, { [key]: value });
    } catch (err) {
      Alert.alert('Could not update', errorMessage(err));
      load(); // put the switch back where the server says it is
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (link: GuardianLink) => {
    setBusy(link.id);
    try {
      await approveGuardian(link.id);
      await load();
    } catch (err) {
      Alert.alert('Could not approve', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = (link: GuardianLink) => {
    Alert.alert(
      'Remove this guardian?',
      `${link.guardian_name ?? 'This guardian'} will immediately lose access to your records. They can reconnect only with a new code from you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(link.id);
            try {
              await revokeGuardian(link.id);
              await load();
            } catch (err) {
              Alert.alert('Could not remove', errorMessage(err));
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
      <View className="bg-slate-900 border border-slate-850 rounded-2xl p-8 items-center">
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="bg-slate-900 border border-slate-850 rounded-2xl p-5">
        <Text className="text-red-400 text-xs leading-relaxed">{error}</Text>
        <TouchableOpacity
          onPress={load}
          className="mt-4 px-4 py-2 border border-slate-850 bg-slate-950 rounded-xl self-start"
        >
          <Text className="text-slate-400 text-xs font-semibold">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canManage = data?.can_manage ?? false;
  const guardians = data?.guardians ?? [];
  const scopeLabels = data?.scope_labels ?? [];

  return (
    <View className="bg-slate-900 border border-slate-850 rounded-2xl p-5">
      {!canManage && data?.locked_reason ? (
        <Text className="text-slate-400 text-xs leading-normal bg-slate-950 p-4 rounded-xl border border-slate-850 mb-5">
          ℹ️ {data.locked_reason} Your guardian keeps access while you are a minor. Ask your teacher
          or school admin if something needs to change.
        </Text>
      ) : (
        <Text className="text-slate-400 text-xs leading-normal bg-slate-950 p-4 rounded-xl border border-slate-850 mb-5">
          🔒 You decide who sees your records and what they see. Share your code to connect a
          guardian, then turn individual sections on or off below.
        </Text>
      )}

      {/* Share code */}
      <View className="bg-slate-950 border border-slate-850 p-4 rounded-xl items-center">
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
          Your Connection Code
        </Text>
        <Text className="text-indigo-400 text-3xl font-black font-mono tracking-[6px] mt-2">
          {code ?? '——————'}
        </Text>
        <Text className="text-slate-500 text-[10px] text-center mt-2 leading-relaxed px-4">
          Give this to your guardian. They enter it in the ActivKlass parent app to connect.
        </Text>
        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={copyCode}
            className="px-4 py-2 bg-indigo-600 rounded-xl"
          >
            <Text className="text-white text-xs font-bold">Copy Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRotate}
            disabled={busy === 'rotate'}
            className="px-4 py-2 border border-slate-850 bg-slate-900 rounded-xl"
          >
            {busy === 'rotate' ? (
              <ActivityIndicator size="small" color="#94a3b8" />
            ) : (
              <Text className="text-slate-400 text-xs font-semibold">New Code</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Connected guardians */}
      <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-6 mb-3">
        Connected Guardians ({guardians.length})
      </Text>

      {guardians.length === 0 ? (
        <View className="bg-slate-950 border border-slate-850 p-5 rounded-xl items-center">
          <Text className="text-slate-500 text-xs text-center">
            Nobody is connected yet. Share your code above to connect a guardian.
          </Text>
        </View>
      ) : (
        guardians.map((link) => (
          <View
            key={link.id}
            className="bg-slate-950 border border-slate-850 p-4 rounded-xl mb-3"
          >
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="text-white text-sm font-bold">
                  {link.guardian_name || link.guardian_email || 'Guardian'}
                </Text>
                <Text className="text-slate-500 text-[10px] mt-1">
                  {link.relationship_type ? `${link.relationship_type} · ` : ''}
                  {link.guardian_email ?? ''}
                </Text>
                {link.status !== 'approved' && (
                  <Text className="text-amber-400 text-[10px] font-bold uppercase mt-1">
                    Waiting for your approval
                  </Text>
                )}
              </View>

              {/* Revoke sits to the right of the name, per the brief. */}
              <TouchableOpacity
                onPress={() => handleRevoke(link)}
                disabled={!canManage || busy === link.id}
                className={`px-3 py-2 rounded-xl border ${
                  canManage ? 'border-red-500/30 bg-red-950/10' : 'border-slate-850 bg-slate-900'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${canManage ? 'text-red-400' : 'text-slate-600'}`}
                >
                  Revoke
                </Text>
              </TouchableOpacity>
            </View>

            {link.status !== 'approved' && canManage && (
              <TouchableOpacity
                onPress={() => handleApprove(link)}
                disabled={busy === link.id}
                className="mt-3 py-3 rounded-xl items-center bg-emerald-600"
              >
                <Text className="text-white text-xs font-bold">Approve Access</Text>
              </TouchableOpacity>
            )}

            {/* Per-guardian visibility toggles */}
            <View className="mt-4 pt-4 border-t border-slate-850">
              {scopeLabels.map((scope) => (
                <View
                  key={scope.key}
                  className="flex-row justify-between items-center py-2"
                >
                  <Text
                    className={`text-xs ${canManage ? 'text-slate-300' : 'text-slate-600'}`}
                  >
                    {scope.label}
                  </Text>
                  <Switch
                    value={!!link.scopes[scope.key]}
                    onValueChange={(v) => handleToggle(link, scope.key, v)}
                    disabled={!canManage || busy === link.id}
                    trackColor={{ false: '#1e293b', true: '#4f46e5' }}
                    thumbColor="#e2e8f0"
                  />
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}
