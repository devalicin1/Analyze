import { useEffect, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { getMenuGroups, saveMenuGroups } from '../../lib/api/menuGroups'
import { MenuGroupsBulkUploadModal } from '../../components/settings/MenuGroupsBulkUploadModal'
import type { MenuGroup } from '../../lib/types'
import { useWorkspace } from '../../context/WorkspaceContext'

export function MenuGroupsSettingsPage() {
  const workspace = useWorkspace()
  const [groups, setGroups] = useState<MenuGroup[]>([])
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)

  useEffect(() => {
    getMenuGroups(workspace).then(setGroups)
  }, [workspace])

  function handleBulkUploadSuccess() {
    getMenuGroups(workspace).then(setGroups)
    setBulkUploadOpen(false)
  }

  function handleGroupChange(groupIndex: number, updates: Partial<MenuGroup>) {
    setGroups((prev) =>
      prev.map((group, index) => (index === groupIndex ? { ...group, ...updates } : group)),
    )
  }

  function handleSubGroupChange(groupIndex: number, subIndex: number, label: string) {
    setGroups((prev) =>
      prev.map((group, index) => {
        if (index !== groupIndex) return group
        const updated = group.subGroups.map((sub, idx) =>
          idx === subIndex ? { ...sub, label } : sub,
        )
        return { ...group, subGroups: updated }
      }),
    )
  }

  function addGroup() {
    const id = `group_${groups.length + 1}`
    setGroups((prev) => [
      ...prev,
      {
        id,
        label: `New group ${prev.length + 1}`,
        color: '#0F8BFD',
        subGroups: [],
      },
    ])
  }

  function removeGroup(indexToRemove: number) {
    setGroups((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  function addSubGroup(groupIndex: number) {
    setGroups((prev) =>
      prev.map((group, index) =>
        index === groupIndex
          ? {
            ...group,
            subGroups: [
              ...group.subGroups,
              { id: `${group.id}_sub_${group.subGroups.length + 1}`, label: 'New subgroup' },
            ],
          }
          : group,
      ),
    )
  }

  function removeSubGroup(groupIndex: number, subIndex: number) {
    setGroups((prev) =>
      prev.map((group, index) =>
        index === groupIndex
          ? { ...group, subGroups: group.subGroups.filter((_, idx) => idx !== subIndex) }
          : group,
      ),
    )
  }

  async function handleSave() {
    setSaving(true)
    setFeedback(null)
    try {
      await saveMenuGroups(workspace, groups)
      setFeedback('Menu groups saved.')
    } catch (error) {
      console.error(error)
      setFeedback('Unable to save menu groups. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="page-title">Menu groups</h1>
          <p className="text-sm text-slate-500">
            Organize menu groups and subgroups for analytics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBulkUploadOpen(true)}
          className="btn-secondary"
        >
          <Upload className="h-4 w-4" />
          Bulk Upload
        </button>
      </header>

      <div className="space-y-4">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className="app-card space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={group.color}
                onChange={(event) => handleGroupChange(groupIndex, { color: event.target.value })}
                className="h-10 w-10 cursor-pointer rounded-xl border border-slate-200 p-1"
                aria-label="Group color"
              />
              <input
                type="text"
                value={group.label}
                onChange={(event) => handleGroupChange(groupIndex, { label: event.target.value })}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Group name"
              />
              <button
                type="button"
                onClick={() => removeGroup(groupIndex)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-red-600"
                title="Remove group"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 pl-14">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subgroups
              </p>
              {group.subGroups.length === 0 && (
                <p className="text-xs text-slate-400 italic">No subgroups defined.</p>
              )}
              {group.subGroups.map((subGroup, subIndex) => (
                <div key={subGroup.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={subGroup.label}
                    onChange={(event) =>
                      handleSubGroupChange(groupIndex, subIndex, event.target.value)
                    }
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Subgroup name"
                  />
                  <button
                    type="button"
                    onClick={() => removeSubGroup(groupIndex, subIndex)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-400 transition hover:bg-slate-50 hover:text-red-600"
                    title="Remove subgroup"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addSubGroup(groupIndex)}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-700"
              >
                <Plus className="h-4 w-4" />
                Add subgroup
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={addGroup}
          className="btn-secondary"
        >
          <Plus className="h-4 w-4" />
          Add group
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary ml-auto"
        >
          {saving ? 'Saving...' : 'Save menu groups'}
        </button>
      </div>
      {feedback && (
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {feedback}
        </div>
      )}

      <MenuGroupsBulkUploadModal
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        workspace={workspace}
        currentGroups={groups}
        onSuccess={handleBulkUploadSuccess}
      />
    </section>
  )
}


