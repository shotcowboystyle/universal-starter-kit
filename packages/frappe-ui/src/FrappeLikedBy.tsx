import { HeartIcon } from '@phosphor-icons/react';
import { Button, formCommonColors } from '@repo/forms';
import { HttpClient, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
/**
 * FrappeLikedBy — social like toggle + liked-by avatar cluster for one doc.
 *
 * Frappe stores likes in the `_liked_by` JSON column on any liked-enabled
 * document, and that column is ONLY writable through the whitelisted
 * `frappe.desk.like.toggle_like` method (the Document API ignores it). So:
 * - reads subscribe to the document via the live collection, so out-of-band
 *   likes update in place when the server emits doc events
 * - live toggles POST `toggle_like` with an optimistic local flip that
 *   reverts on failure
 * - fixture-backed configs (stories / tests) emulate the whitelisted method
 *   with an optimistic collection update (TanStack DB rolls back on failure)
 */
import { AsyncBoundary, Avatar } from '@repo/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack, isWeb, styled, useTheme } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useFrappeUsers } from './frappe-users';
import type { FrappeUserDisplay } from './frappe-users';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { toLiveLoadError } from './live-errors';

const LikedByAvatarSlot = styled(XStack, { name: 'LikedByAvatarSlot' });

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Parses the raw `_liked_by` value (JSON string on the wire, occasionally
 * already an array) into a clean user-id list. Malformed data → [].
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this is the boundary parser for the raw `_liked_by` column
export const parseLikedBy = (raw: unknown): string[] => {
  if (raw === null || raw === undefined) {
    return [];
  }
  let value = raw;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the column arrives as a JSON string or an already-parsed array
  if (typeof value === 'string') {
    if (!value.trim()) {
      return [];
    }
    try {
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- the parsed value is checked with Array.isArray below
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
};

/**
 * Computes the toggled liked-by list for `user`:
 * present → removed (`add: false`), absent → appended (`add: true`).
 */
/** The liked-by list after a toggle, and whether the toggle adds the user. */
export interface LikedByToggle {
  next: string[];
  add: boolean;
}

export const toggleLikedBy = (likedBy: readonly string[], user: string): LikedByToggle => {
  if (likedBy.includes(user)) {
    return { next: likedBy.filter((id) => id !== user), add: false };
  }
  return { next: [...likedBy, user], add: true };
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FrappeLikedDoc {
  name: string;
  doctype: string;
  _liked_by?: string;
}

export interface FrappeLikedByProps extends Omit<YStackProps, 'children' | 'name'> {
  /** DocType of the liked document. */
  doctype: string;
  /** Name of the liked document. */
  name: string;
  /**
   * Session user the heart toggles for. When omitted (live mode) it is
   * resolved once via `frappe.auth.get_logged_user`.
   */
  currentUser?: string;
  /** Disable the toggle affordance (list still renders). */
  disabled?: boolean;
  /** Render the liked-by avatar cluster. Default true. */
  showAvatars?: boolean;
  /** Avatars shown before collapsing into a "+N" bubble. Default 3. */
  maxAvatars?: number;
  /** Called after a toggle is accepted: `liked` is the new state for the user. */
  onToggle?: (liked: boolean, likedBy: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type FrappeConfigValue = ReturnType<typeof useFrappeConfig>;

/** A client for the whitelisted like method; fixture corpora answer locally instead. */
const createLikeHttp = (config: FrappeConfigValue): HttpClient | undefined => {
  if (!config || config.baseURL === undefined || config.baseURL === '' || config.fixtures) {
    return undefined;
  }
  const { baseURL } = config;
  // SAFETY: the provider's auth block carries the token fields HttpClient's AuthConfig reads
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  return new HttpClient(baseURL, config.auth as Parameters<typeof HttpClient.prototype.updateAuth>[0]);
};

/** Resolves the session user once when the consumer did not pin one. */
const useSessionUser = (http: HttpClient | undefined, currentUser: string | undefined): string | undefined => {
  const [sessionUser, setSessionUser] = useState<string | undefined>();
  useEffect(() => {
    if ((currentUser !== undefined && currentUser !== '') || !http) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    const resolveUser = async () => {
      try {
        const response = await http.get<{ message?: string }>('/api/method/frappe.auth.get_logged_user');
        const message = response.payload?.message;
        if (!cancelled && message !== undefined && message !== '') {
          setSessionUser(message);
        }
      } catch {
        // Anonymous / unreachable — the heart stays disabled.
      }
    };
    void resolveUser();
    return () => {
      cancelled = true;
    };
  }, [currentUser, http]);
  return currentUser ?? sessionUser;
};

const heartColor = (liked: boolean, theme: ReturnType<typeof useTheme>): string | undefined => {
  if (isWeb) {
    return liked ? formCommonColors.error : 'currentColor';
  }
  const token = liked ? theme.red11 : theme.color;
  // oxlint-disable-next-line typescript/no-unsafe-return -- tamagui types a theme variable's resolved value loosely; `.val` is its color string
  return token?.val;
};

const toConnectionConfig = (config: FrappeConfigValue) =>
  config
    ? {
        baseURL: config.baseURL,
        socketPort: config.socketPort,
        siteName: config.siteName,
        socketBaseURL: config.socketBaseURL,
        auth: config.auth,
        syncOptions: config.syncOptions,
        realtime: config.realtime,
        fixtures: config.fixtures,
      }
    : undefined;

/** The liked-by avatar cluster, collapsing past `visibleAvatars` into a "+N" bubble. */
const LikedByAvatars = ({
  users,
  visibleAvatars,
  overflow,
}: {
  users: Map<string, FrappeUserDisplay>;
  visibleAvatars: string[];
  overflow: number;
}) => {
  const { t } = useTranslation();
  if (visibleAvatars.length === 0) {
    return null;
  }
  return (
    <XStack alignItems="center">
      {visibleAvatars.map((id, index) => {
        const info = users.get(id);
        return (
          <LikedByAvatarSlot
            key={id}
            marginLeft={index === 0 ? 0 : -8}
            zIndex={index + 1}>
            <Avatar
              size="$1.5"
              src={info?.image}
              name={info?.label ?? id}
            />
          </LikedByAvatarSlot>
        );
      })}
      {overflow > 0 ? (
        <LikedByAvatarSlot
          marginLeft={-8}
          zIndex={visibleAvatars.length + 1}>
          <Avatar
            size="$1.5"
            initials={`+${overflow}`}
            alt={t('{{count}} more users', { count: overflow })}
          />
        </LikedByAvatarSlot>
      ) : null}
    </XStack>
  );
};

const FrappeLikedByBody = ({
  doctype,
  name,
  currentUser,
  disabled = false,
  showAvatars = true,
  maxAvatars = 3,
  onToggle,
  onRetry,
  ...stackProps
}: FrappeLikedByProps & { onRetry?: () => void }) => {
  const config = useFrappeConfig();
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // Native SVG can't parse CSS color strings (`var(--red10)` / `currentColor`)
  // — resolve concrete theme values there; web keeps the CSS vars.
  const theme = useTheme();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Optimistic flip for the live (toggle_like) path — reverted on failure,
  // dropped as soon as the server echoes a fresh `_liked_by`.
  const [override, setOverride] = useState<string[] | null>(null);
  // Honest error state (DG-ST-01): surface failed subscription fetches as
  // error chrome, never as "zero likes".
  const [syncError, setSyncError] = useState<unknown>(null);

  const connectionConfig = useMemo(() => toConnectionConfig(config), [config]);

  const filters = useMemo<[string, string, unknown][]>(() => [['name', '=', name]], [name]);

  const collection = useFrappeCollection<FrappeLikedDoc>(connectionConfig, doctype, {
    filters,
    fields: ['name', '_liked_by'],
    onSyncError: setSyncError,
  });

  const { data, isLoading } = useLiveQuery((q) => (collection ? q.from({ _list: collection }) : null), [collection]);

  // SAFETY: the live query selects only from the FrappeLikedDoc collection
  const [doc] = (data as FrappeLikedDoc[] | undefined) ?? [];
  const serverLikedBy = useMemo(() => parseLikedBy(doc?._liked_by), [doc?._liked_by]);

  // Any fresh server value supersedes the optimistic flip (it either echoes
  // our own toggle or carries an out-of-band change — both win).
  const serverKey = JSON.stringify(serverLikedBy);
  const lastServerKeyRef = useRef(serverKey);
  useEffect(() => {
    if (lastServerKeyRef.current === serverKey) {
      return;
    }
    lastServerKeyRef.current = serverKey;
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- a fresh server value must drop the optimistic flip; the ref guard keeps it to real changes
    setOverride(null);
  }, [serverKey]);

  const likedBy = override ?? serverLikedBy;

  const http = useMemo(() => createLikeHttp(config), [config]);

  const effectiveUser = useSessionUser(http, currentUser);
  const hasUser = effectiveUser !== undefined && effectiveUser !== '';
  const liked = hasUser && likedBy.includes(effectiveUser);

  const handleToggle = useCallback(async () => {
    if (disabled || pending || !hasUser) {
      return;
    }
    setActionError(null);
    const { next, add } = toggleLikedBy(likedBy, effectiveUser);

    if (config?.fixtures) {
      // Fixture stand-in for the whitelisted method: optimistic collection
      // update; TanStack DB rolls the flip back if the fixture rejects.
      if (!collection) {
        return;
      }
      setPending(true);
      try {
        const tx = collection.update(name, (draft) => {
          draft._liked_by = JSON.stringify(next);
        });
        await tx.isPersisted.promise;
        onToggle?.(add, next);
      } catch {
        setActionError(t('Failed to update like'));
      }
      setPending(false);
      return;
    }

    if (!http) {
      return;
    }
    setPending(true);
    setOverride(next);
    try {
      await http.post('/api/method/frappe.desk.like.toggle_like', {
        doctype,
        name,
        add: add ? 'Yes' : 'No',
      });
      onToggle?.(add, next);
    } catch {
      // Honest revert: the server rejected the toggle.
      setOverride(null);
      setActionError(t('Failed to update like'));
    }
    setPending(false);
  }, [
    disabled,
    pending,
    hasUser,
    effectiveUser,
    likedBy,
    config?.fixtures,
    collection,
    http,
    doctype,
    name,
    onToggle,
    t,
  ]);

  const users = useFrappeUsers(config, likedBy);
  const visibleAvatars = likedBy.slice(0, Math.max(0, maxAvatars));
  const overflow = likedBy.length - visibleAvatars.length;

  const loadError = useMemo(
    () =>
      syncError === null
        ? null
        : toLiveLoadError(syncError, {
            permissionMessage: t('You do not have permission to view likes'),
            genericMessage: t('Failed to load likes'),
          }),
    [syncError, t],
  );

  const canToggle = !disabled && !pending && hasUser && !!collection;

  return (
    <YStack
      {...knobProps.gap}
      testID="frappe-liked-by"
      {...stackProps}>
      <FrappeReconnectIndicator config={connectionConfig} />
      <AsyncBoundary
        compact
        loading={!!collection && isLoading}
        error={loadError}
        onRetry={onRetry}>
        <XStack
          alignItems="center"
          gap="$2">
          <Button
            size="$2"
            circular
            chromeless
            disabled={!canToggle}
            aria-pressed={liked}
            aria-label={liked ? t('Unlike') : t('Like')}
            // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler, never rejects
            onPress={handleToggle}
            icon={
              <HeartIcon
                size={16}
                weight={liked ? 'fill' : 'regular'}
                color={heartColor(liked, theme)}
              />
            }
          />
          {likedBy.length > 0 ? (
            <Text
              {...knobProps.label}
              color={formCommonColors.muted}
              aria-label={t('Liked by {{count}} users', { count: likedBy.length })}
              testID="frappe-liked-by-count">
              {likedBy.length}
            </Text>
          ) : null}
          {showAvatars ? (
            <LikedByAvatars
              users={users}
              visibleAvatars={visibleAvatars}
              overflow={overflow}
            />
          ) : null}
        </XStack>
      </AsyncBoundary>
      {actionError !== null && actionError !== '' ? (
        <Text
          role="alert"
          {...knobProps.label}
          color={formCommonColors.error}>
          {actionError}
        </Text>
      ) : null}
    </YStack>
  );
};

/**
 * Heart / like toggle with count and liked-by avatar cluster, live-synced
 * to the document's `_liked_by` field.
 */
export const FrappeLikedBy = (props: FrappeLikedByProps) => {
  // Retry re-creates the doc collection (fresh initial sync) by remounting
  // the body — useFrappeCollection has no refetch surface of its own.
  const [retryNonce, setRetryNonce] = useState(0);
  const handleRetry = useCallback(() => {
    setRetryNonce((nonce) => nonce + 1);
  }, []);
  return (
    <FrappeLikedByBody
      key={retryNonce}
      onRetry={handleRetry}
      {...props}
    />
  );
};
