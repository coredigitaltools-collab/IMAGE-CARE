import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FormField } from '../settings/FormField'

interface CategoryFormModalProps {
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}

export function CategoryFormModal({ onClose, onSubmit }: CategoryFormModalProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(name)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New expense category" onClose={onClose}>
      <div className="space-y-4">
        <FormField id="ec-name" label="Category name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent, Utilities, Supplies" />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
