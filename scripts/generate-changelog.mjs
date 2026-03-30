import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');
const packageJsonPath = resolve(repoRoot, 'package.json');
const checkMode = process.argv.includes('--check');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function gitLog(range) {
  const args = ['log', '--reverse', '--pretty=format:%H%x1f%s%x1f%cI%x1e'];
  if (range) {
    args.push(range);
  }

  const output = git(args);
  if (!output) {
    return [];
  }

  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject, committedAt] = entry.split('\x1f');
      return { hash, subject, committedAt };
    });
}

function parseConventionalCommit(subject) {
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<description>.+)$/i.exec(
    subject,
  );

  if (!match?.groups) {
    return null;
  }

  return {
    type: match.groups.type.toLowerCase(),
    scope: match.groups.scope ?? null,
    breaking: Boolean(match.groups.breaking),
    description: match.groups.description.trim(),
  };
}

function shouldSkipCommit(parsed) {
  return parsed.type === 'docs' && parsed.scope === 'changelog';
}

function sectionForCommit(parsed) {
  if (parsed.type === 'feat') {
    return 'Added';
  }

  if (parsed.type === 'fix') {
    return 'Fixed';
  }

  return 'Changed';
}

function formatEntry(commit, parsed) {
  const scopePrefix = parsed.scope ? `${parsed.scope}: ` : '';
  const breakingSuffix = parsed.breaking ? ' [breaking]' : '';
  return `- ${scopePrefix}${parsed.description}${breakingSuffix} (\`${commit.hash.slice(0, 7)}\`)`;
}

function buildSections(commits) {
  const buckets = new Map([
    ['Added', []],
    ['Changed', []],
    ['Fixed', []],
  ]);

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit.subject);
    if (!parsed || shouldSkipCommit(parsed)) {
      continue;
    }

    const section = sectionForCommit(parsed);
    buckets.get(section).push(formatEntry(commit, parsed));
  }

  return [...buckets.entries()].filter(([, entries]) => entries.length > 0);
}

function renderRelease(title, date, commits) {
  const sections = buildSections(commits);
  const lines = [`## [${title}]${date ? ` - ${date}` : ''}`, ''];

  if (sections.length === 0) {
    lines.push('- No changelog entries.', '');
    return lines.join('\n');
  }

  for (const [section, entries] of sections) {
    lines.push(`### ${section}`);
    lines.push(...entries);
    lines.push('');
  }

  return lines.join('\n');
}

function getSemverTags() {
  const output = git(['tag', '--list', 'v*', '--sort=-v:refname']);
  if (!output) {
    return [];
  }

  return output
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

function getTagDate(tag) {
  return git(['log', '-1', '--format=%cs', tag]);
}

const tags = getSemverTags();
const renderedReleases = [];

if (tags.length === 0) {
  renderedReleases.push(renderRelease(currentVersion, git(['log', '-1', '--format=%cs', 'HEAD']), gitLog('HEAD')));
} else {
  const unreleasedCommits = gitLog(`${tags[0]}..HEAD`);
  renderedReleases.push(renderRelease('Unreleased', null, unreleasedCommits));

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    const previousTag = tags[index + 1];
    const range = previousTag ? `${previousTag}..${tag}` : tag;
    renderedReleases.push(renderRelease(tag.slice(1), getTagDate(tag), gitLog(range)));
  }
}

const content = [
  '# Changelog',
  '',
  'All notable changes to this project will be documented in this file.',
  '',
  'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).',
  '',
  ...(tags.length === 0 ? ['## [Unreleased]', ''] : []),
  ...renderedReleases,
]
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd()
  .concat('\n');

if (checkMode) {
  const current = readFileSync(changelogPath, 'utf8');
  if (current !== content) {
    process.stderr.write('CHANGELOG.md is out of date. Run npm run changelog.\n');
    process.exit(1);
  }
  process.exit(0);
}

writeFileSync(changelogPath, content, 'utf8');
