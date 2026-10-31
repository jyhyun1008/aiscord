import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../app/utils/backup.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const exports = {}
vm.runInNewContext(outputText, { exports })
const { mergeBackups, parseBackup, dropUntouchedSeed } = exports

const backup = (fields = {}) => ({ version: 1, exportedAt: 0, projects: [], threads: [], deleted: {}, messages: {}, ...fields })
const project = (id, changedAt) => ({ id, changedAt })
const thread = (id, changedAt, projectId = 'p') => ({ id, projectId, changedAt, title: id })
const ids = list => Array.from(list, x => x.id)

test('threads from both sides are kept, each with its own history', () => {
  const a = backup({ projects: [project('p', 1)], threads: [thread('a', 1)], messages: { a: ['A'] } })
  const b = backup({ projects: [project('p', 1)], threads: [thread('b', 2)], messages: { b: ['B'] } })
  const { merged, fromRemote } = mergeBackups(a, b)
  assert.deepEqual(ids(merged.threads), ['a', 'b'])
  assert.deepEqual(Array.from(merged.messages.a), ['A'])
  assert.deepEqual(Array.from(merged.messages.b), ['B'])
  assert.deepEqual(Array.from(fromRemote), ['b'])
})

test('the thread changed last wins whole', () => {
  const a = backup({ projects: [project('p', 1)], threads: [thread('t', 5)], messages: { t: ['옛'] } })
  const b = backup({ projects: [project('p', 1)], threads: [thread('t', 9)], messages: { t: ['새'] } })
  assert.deepEqual(Array.from(mergeBackups(a, b).merged.messages.t), ['새'])
  const back = mergeBackups(b, a)
  assert.deepEqual(Array.from(back.merged.messages.t), ['새'])
  assert.equal(back.fromRemote.length, 0)
})

test('a deleted thread stays deleted when the other side still has the older copy', () => {
  const a = backup({ projects: [project('p', 1)], deleted: { t: 7 } })
  const b = backup({ projects: [project('p', 1)], threads: [thread('t', 5)], messages: { t: ['x'] } })
  const { merged } = mergeBackups(a, b)
  assert.equal(merged.threads.length, 0)
  assert.equal(merged.deleted.t, 7)
})

test('a thread changed after the deletion comes back', () => {
  const a = backup({ projects: [project('p', 1)], deleted: { t: 7 } })
  const b = backup({ projects: [project('p', 1)], threads: [thread('t', 9)] })
  assert.equal(mergeBackups(a, b).merged.threads.length, 1)
})

test('deleting a project also takes threads that only the other side has', () => {
  const a = backup({ deleted: { p: 7 } })
  const b = backup({ projects: [project('p', 1)], threads: [thread('t', 9)] })
  const { merged } = mergeBackups(a, b)
  assert.equal(merged.projects.length, 0)
  assert.equal(merged.threads.length, 0)
})

test('an empty seed project is dropped when the other copy has projects', () => {
  const local = backup({ projects: [{ id: 'seed' }] })
  assert.equal(dropUntouchedSeed(local, backup({ projects: [project('p', 1)] })).projects.length, 0)
  assert.equal(dropUntouchedSeed(local, backup()).projects.length, 1)
})

test('a seed project in use is kept', () => {
  const local = backup({ projects: [{ id: 'seed' }], threads: [thread('t', 1, 'seed')] })
  assert.equal(dropUntouchedSeed(local, backup({ projects: [project('p', 1)] })).projects.length, 1)
})

test('files that are not Aiscord backups are refused', () => {
  assert.throws(() => parseBackup('nope'), /백업 파일이 아니에요/)
  assert.throws(() => parseBackup('{"version":2}'), /백업 파일이 아니에요/)
  assert.equal(parseBackup('{"version":1,"projects":[],"threads":[]}').threads.length, 0)
})
