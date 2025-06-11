import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { EquipmentSubmissionForm } from '../ui/EquipmentSubmissionForm'

interface EquipmentSubmitPageProps {
  baseUrl: string
  user?: { email?: string; id: string }
  children?: any
}

export const EquipmentSubmitPage: FC<EquipmentSubmitPageProps> = ({ baseUrl, user, children }) => {
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Submit Equipment', href: '/equipment/submit' },
  ]

  return (
    <Layout
      title="Submit New Equipment | TT Reviews"
      description="Submit new table tennis equipment to the database. Help grow our comprehensive equipment review platform."
    >
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">Submit New Equipment</h1>
            <p class="text-lg text-gray-600">
              Help expand our equipment database by submitting new table tennis equipment.
            </p>
          </div>

          <EquipmentSubmissionForm baseUrl={baseUrl} />
          {children}
        </div>
      </div>
    </Layout>
  )
}
