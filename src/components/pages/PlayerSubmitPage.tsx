import { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { PlayerForm } from '../ui/PlayerForm'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'

export const PlayerSubmitPage: FC = () => {
  const breadcrumbs = generateBreadcrumbs('/players/submit')

  return (
    <Layout
      title="Submit New Player - TT Reviews"
      description="Submit a new professional table tennis player profile with their equipment setup and details."
    >
      <Breadcrumb items={breadcrumbs} />

      <section class="py-8">
        <div class="main-container">
          <div class="page-header mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">Submit New Player</h1>
            <p class="text-lg text-gray-600 max-w-3xl">
              Help us grow our database by submitting a new professional table tennis player.
              Include their current equipment setup and any relevant details you know about their
              playing style and achievements.
            </p>
          </div>

          <div class="submission-guidelines bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h3 class="text-lg font-semibold text-blue-900 mb-3">Submission Guidelines</h3>
            <ul class="space-y-2 text-blue-800">
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                Only submit professional or well-known competitive players
              </li>
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                Equipment information should be verified with reliable sources
              </li>
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                Include source URLs when possible (interviews, videos, official websites)
              </li>
              <li class="flex items-start">
                <span class="text-blue-600 mr-2">•</span>
                All submissions will be reviewed before being published
              </li>
            </ul>
          </div>

          <PlayerForm />
        </div>
      </section>
    </Layout>
  )
}
