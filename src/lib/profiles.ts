'use client';

import type { DiscoveredMetadata, PersistedProfile } from '@/types';

const PROFILES_KEY = 'ad-tool.profiles.v1';
const ACTIVE_KEY = 'ad-tool.activeProfileId.v1';
const DISCOVERY_PREFIX = 'ad-tool.discovery.v1.';

/** In-memory passwords for the session only. Never persisted. */
const sessionPasswords = new Map<string, string>();

export function loadProfiles(): PersistedProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: PersistedProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function setSessionPassword(id: string, password: string): void {
  if (password) sessionPasswords.set(id, password);
}

export function getSessionPassword(id: string): string | undefined {
  return sessionPasswords.get(id);
}

export function clearSessionPassword(id: string): void {
  sessionPasswords.delete(id);
}

export function loadDiscovery(profileId: string): DiscoveredMetadata | null {
  try {
    const raw = localStorage.getItem(DISCOVERY_PREFIX + profileId);
    return raw ? (JSON.parse(raw) as DiscoveredMetadata) : null;
  } catch {
    return null;
  }
}

export function saveDiscovery(profileId: string, metadata: DiscoveredMetadata): void {
  localStorage.setItem(DISCOVERY_PREFIX + profileId, JSON.stringify(metadata));
}

export function clearDiscovery(profileId: string): void {
  localStorage.removeItem(DISCOVERY_PREFIX + profileId);
}
