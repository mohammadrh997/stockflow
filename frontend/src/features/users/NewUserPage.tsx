import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Panel } from '@/components/Panel'
import { PageHeader } from '@/components/PageHeader'
import { useCreateUser } from './queries'
import { UserForm } from './UserForm'

export function NewUserPage() {
  const navigate = useNavigate()
  const createUser = useCreateUser()

  return (
    <div className="grid gap-6">
      <PageHeader title="New user" trail={[{ to: '/users', label: 'Users' }]} />
      <Panel>
        <UserForm
          withPassword
          submitLabel="Create user"
          onSubmit={async (values) => {
            const user = await createUser.mutateAsync(values)
            toast.success(`Created ${user.name}`)
            navigate(`/users/${user.id}`, { replace: true })
          }}
        />
      </Panel>
    </div>
  )
}
