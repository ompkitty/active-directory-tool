import type { Entry } from 'ldapts';
import type { LdapTransport } from '@/lib/ldap/client';

/**
 * In-memory directory double for integration tests.
 *
 * Mirrors the behaviours that were discovered against a real Windows Server
 * 2025 lab and that silently broke earlier implementations:
 *  - there is no CN=Subschema entry; schema definitions live on the
 *    subSchema children of the schema NC as RFC 4512 attributeTypes strings
 *  - DNS zone contexts are pure DC= chains and must not be treated as domains
 *  - reading a deleted DN answers noSuchObject / DSID "problem 2001 (NO_OBJECT)"
 *  - rights failures arrive as INSUFF_ACCESS_RIGHTS / DSID problem 4003
 */
export interface FakeDirectoryOptions {
  /** Objects keyed by lowercase DN. */
  entries?: Record<string, Entry>;
  /** Lowercase DNs that should fail with insufficient rights. */
  denyDelete?: string[];
  denyModify?: string[];
  denyAdd?: string[];
  denyMove?: string[];
  /** Bind identities accepted; anything else fails as invalid credentials. */
  validBind?: string[];
  validPassword?: string;
}

export const LAB_ROOTDSE: Record<string, unknown> = {
  dn: '',
  defaultNamingContext: 'DC=lab1,DC=local',
  namingContexts: [
    'DC=lab1,DC=local',
    'CN=Configuration,DC=lab1,DC=local',
    'CN=Schema,CN=Configuration,DC=lab1,DC=local',
    'DC=DomainDnsZones,DC=lab1,DC=local',
    'DC=ForestDnsZones,DC=lab1,DC=local',
  ],
  dnsHostName: 'labserver.lab1.local',
  schemaNamingContext: 'CN=Schema,CN=Configuration,DC=lab1,DC=local',
  dnsForestRoot: [],
  domainFunctionality: '10',
  forestFunctionality: '10',
};

const SCHEMA_NC = 'CN=Schema,CN=Configuration,DC=lab1,DC=local';
const CONFIG_NC = 'CN=Configuration,DC=lab1,DC=local';
const DOMAIN_NC = 'DC=lab1,DC=local';

const definition = (oid: string, name: string, extra = '') =>
  `( ${oid} NAME '${name}' SYNTAX '1.3.6.1.4.1.1466.115.121.1.15' ${extra} )`;

/** A schema container shaped like the lab's CN=Aggregate entry. */
export const LAB_SCHEMA_ENTRY: Entry = {
  dn: `CN=Aggregate,${SCHEMA_NC}`,
  cn: 'Aggregate',
  objectClass: ['top', 'subSchema'],
  attributeTypes: [
    definition('2.5.4.3', 'cn', 'SINGLE-VALUE'),
    definition('1.2.840.113556.1.4.146', 'sAMAccountName', 'SINGLE-VALUE'),
    definition('0.9.2342.19200300.100.1.3', 'mail'),
    definition('2.5.4.20', 'telephoneNumber'),
    definition('2.5.4.4', 'sn', 'SINGLE-VALUE'),
    definition('2.5.4.42', 'givenName', 'SINGLE-VALUE'),
    definition('1.2.840.113556.1.4.90', 'unicodePwd'),
    definition('2.5.18.10', 'userPassword', 'SINGLE-VALUE'),
    definition('1.2.840.113556.1.4.8', 'userAccountControl', 'SINGLE-VALUE'),
    definition('1.2.840.113556.1.4.35', 'pwdLastSet', 'SINGLE-VALUE'),
    definition('2.5.4.31', 'member', 'SINGLE-VALUE'),
    definition('2.5.4.6', 'objectClass', 'SINGLE-VALUE'),
    definition('1.2.840.113556.1.4.60', 'description'),
    definition('2.5.4.11', 'ou', 'SINGLE-VALUE'),
    definition('1.2.840.113556.1.4.2', 'department', 'SINGLE-VALUE'),
  ],
  objectClasses: [
    "( 1.2.840.113556.1.5.9 NAME 'user' SUP organizationalPerson STRUCTURAL )",
  ],
};

export const LAB_USER: Entry = {
  dn: 'CN=Alice Example,OU=IT,OU=Benutzer,DC=lab1,DC=local',
  objectClass: ['top', 'person', 'organizationalPerson', 'user'],
  // Real AD populates objectCategory; the user search filter relies on it.
  objectCategory: 'CN=Person,CN=Schema,CN=Configuration,DC=lab1,DC=local',
  cn: 'Alice Example',
  sAMAccountName: 'a.example',
  userPrincipalName: 'a.example@lab1.local',
  displayName: 'Alice Example',
  givenName: 'Alice',
  sn: 'Example',
  mail: 'a.example@lab1.local',
  telephoneNumber: '+49 555 0100',
  userAccountControl: '512',
  objectGUID: Buffer.from([0x01, 0x02, 0x03]),
  description: 'Lab test user',
  department: 'IT',
};

export const LAB_OU: Entry = {
  dn: 'OU=IT,OU=Benutzer,DC=lab1,DC=local',
  objectClass: ['top', 'organizationalUnit'],
  ou: 'IT',
  cn: 'IT',
};

export function defaultDirectory(): Record<string, Entry> {
  return {
    '': LAB_ROOTDSE as unknown as Entry,
    [LAB_USER.dn.toLowerCase()]: LAB_USER,
    [LAB_OU.dn.toLowerCase()]: LAB_OU,
    [`cn=configuration,dc=lab1,dc=local`]: {
      dn: CONFIG_NC,
      cn: 'Configuration',
      objectClass: ['top', 'configuration'],
    },
    [`cn=schema,cn=configuration,dc=lab1,dc=local`]: {
      dn: SCHEMA_NC,
      cn: 'Schema',
      objectClass: ['top', 'dMD'],
    },
    [`cn=aggregate,${SCHEMA_NC}`.toLowerCase()]: LAB_SCHEMA_ENTRY,
    [`cn=subschema,${CONFIG_NC}`.toLowerCase()]: {
      dn: `CN=Subschema,${CONFIG_NC}`,
      cn: 'Subschema',
      objectClass: ['top', 'subschema'],
    },
    'dc=lab1,dc=local': { dn: DOMAIN_NC, objectClass: ['top', 'domain', 'domainDNS'] },
  };
}

/**
 * Minimal RFC 4515 filter evaluator: &, |, !, and substring matching.
 * Enough to exercise the filters this application builds, including proving
 * that escaped input cannot widen a search.
 */
export function entryMatchesFilter(entry: Entry, filter: string): boolean {
  return evaluateFilter(entry, filter.trim());
}

function evaluateFilter(entry: Entry, filter: string): boolean {
  if (!filter.startsWith('(')) return true;
  if (filter.startsWith('(&')) {
    return splitFilters(filter.slice(2, -1)).every((f) => evaluateFilter(entry, f));
  }
  if (filter.startsWith('(|')) {
    return splitFilters(filter.slice(2, -1)).some((f) => evaluateFilter(entry, f));
  }
  if (filter.startsWith('(!')) {
    return !evaluateFilter(entry, filter.slice(2, -1));
  }
  const match = /^\(([a-zA-Z0-9-]+)\s*=\s*([\s\S]*)\)$/.exec(filter);
  if (!match) return true;
  const [, attribute, value] = match;
  const actual = attributeValues(entry, attribute);
  if (value === '*') return actual.length > 0; // presence check
  // Substring semantics: leading/trailing '*' are wildcards, not literals.
  const wanted = value.replace(/^\*/, '').replace(/\*$/, '').toLowerCase();
  if (wanted === '') return actual.length > 0;
  return actual.some((v) => v.toLowerCase().includes(wanted));
}

function attributeValues(entry: Entry, attribute: string): string[] {
  const key = Object.keys(entry).find((k) => k.toLowerCase() === attribute.toLowerCase());
  if (!key) return [];
  const raw = entry[key];
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((v) => (typeof v === 'string' ? v : v.toString('base64')));
}

/** Split a compound filter body into re-wrapped "(...)" sub-filters. */
function splitFilters(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') {
      depth++;
      if (depth === 1) {
        current = '';
        continue;
      }
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        parts.push(`(${current})`);
        continue;
      }
    }
    current += ch;
  }
  return parts;
}

export class FakeDirectory implements LdapTransport {
  readonly operations: string[] = [];
  private entries: Record<string, Entry>;
  private readonly options: FakeDirectoryOptions;

  constructor(options: FakeDirectoryOptions = {}) {
    this.options = options;
    this.entries = { ...defaultDirectory(), ...(options.entries ?? {}) };
  }

  seed(dn: string, entry: Entry): void {
    this.entries[dn.toLowerCase()] = entry;
  }

  get(dn: string): Entry | undefined {
    return this.entries[dn.toLowerCase()];
  }

  async bind(dn: string, password: string): Promise<void> {
    this.operations.push(`bind:${dn}`);
    const validBind = this.options.validBind ?? ['ad-writer@lab1.local', 'CN=Admin,DC=lab1,DC=local'];
    const validPassword = this.options.validPassword ?? 'Lab1passwd.';
    if (!validBind.includes(dn) || password !== validPassword) {
      throw new Error('Invalid Credentials');
    }
  }

  async search(
    base: string,
    options: { scope?: string; filter?: string; attributes?: string[] },
  ): Promise<{ searchEntries: Entry[] }> {
    this.operations.push(`search:${base || '<root>'}:${options.scope ?? ''}`);

    if (base === '') {
      return { searchEntries: [this.entries['']] };
    }

    const baseKey = base.toLowerCase();
    if (options.scope === 'one' || options.scope === 'sub') {
      // AD stores schema definitions on subSchema children, not on CN=Subschema.
      if (baseKey === SCHEMA_NC.toLowerCase()) {
        return { searchEntries: [LAB_SCHEMA_ENTRY] };
      }
      const children = Object.values(this.entries).filter((e) => {
        const d = e.dn.toLowerCase();
        return d !== base.toLowerCase() && d.endsWith(',' + baseKey);
      });
      const filtered = options.filter
        ? children.filter((e) => entryMatchesFilter(e, options.filter as string))
        : children;
      return { searchEntries: filtered };
    }

    const entry = this.entries[baseKey];
    if (!entry) {
      // Mirrors AD: deleted or unknown DN -> NO_OBJECT DSID text.
      throw new Error(
        '0000208D: NameErr: DSID-0310028F, problem 2001 (NO_OBJECT), data 0, best match of:\n Code: 0x20',
      );
    }
    const matches = options.filter ? entryMatchesFilter(entry, options.filter) : true;
    return { searchEntries: matches ? [entry] : [] };
  }

  async add(dn: string, attributes: Record<string, string | string[]>): Promise<void> {
    this.operations.push(`add:${dn}`);
    this.deny('denyAdd', dn, '0000209C: AddErr: DSID-031A12A2, problem 5003 (WILL_NOT_PERFORM)');
    if (this.entries[dn.toLowerCase()]) {
      throw new Error('0000208E: DSID-031C0956, problem 5002 (ALREADY_EXISTS)');
    }
    this.entries[dn.toLowerCase()] = {
      dn,
      objectClass: ['top', 'person', 'organizationalPerson', 'user'],
      objectCategory: 'CN=Person,CN=Schema,CN=Configuration,DC=lab1,DC=local',
      ...attributes,
    };
  }

  async modify(dn: string, change: unknown): Promise<void> {
    this.operations.push(`modify:${dn}`);
    this.deny('denyModify', dn, '00002005: SecErr: DSID-03152612, problem 4003 (INSUFF_ACCESS_RIGHTS)');
    const entry = this.entries[dn.toLowerCase()];
    if (!entry) {
      throw new Error('0000208D: NameErr: problem 2001 (NO_OBJECT), Code: 0x20');
    }
    const ch = change as { modification?: { type: string; values: string[] } };
    const attribute = ch.modification?.type ?? '';
    const values = ch.modification?.values ?? [];
    this.entries[dn.toLowerCase()] = { ...entry, [attribute]: values };
  }

  async modifyDN(dn: string, newDN: string): Promise<void> {
    this.operations.push(`modifyDN:${dn}->${newDN}`);
    this.deny('denyMove', dn, '00002005: SecErr: DSID-03152612, problem 4003 (INSUFF_ACCESS_RIGHTS)');
    const entry = this.entries[dn.toLowerCase()];
    if (!entry) {
      throw new Error('0000208D: NameErr: problem 2001 (NO_OBJECT), Code: 0x20');
    }
    if (this.entries[newDN.toLowerCase()]) {
      throw new Error('0000208E: DSID, problem 5002 (ALREADY_EXISTS)');
    }
    delete this.entries[dn.toLowerCase()];
    this.entries[newDN.toLowerCase()] = { ...entry, dn: newDN };
  }

  async del(dn: string): Promise<void> {
    this.operations.push(`delete:${dn}`);
    this.deny('denyDelete', dn, '00002005: SecErr: DSID-03152612, problem 4003 (INSUFF_ACCESS_RIGHTS)');
    if (!this.entries[dn.toLowerCase()]) {
      throw new Error('0000208D: NameErr: problem 2001 (NO_OBJECT), Code: 0x20');
    }
    delete this.entries[dn.toLowerCase()];
  }

  async unbind(): Promise<void> {
    this.operations.push('unbind');
  }

  private deny(key: 'denyAdd' | 'denyModify' | 'denyDelete' | 'denyMove', dn: string, message: string) {
    const list = (this.options[key] ?? []).map((d) => d.toLowerCase());
    if (list.includes(dn.toLowerCase())) throw new Error(message);
  }
}
