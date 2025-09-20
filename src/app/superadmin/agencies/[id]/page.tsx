import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Calendar, Building2 } from 'lucide-react'
import { AgencyMembers } from './AgencyMembersFixed'
import { AgencySettings } from './AgencySettings'

interface PageProps {
  params: { id: string }
  searchParams: { tab?: string }
}

export default async function AgencyDetailsPage({ params, searchParams }: PageProps) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch agency details
  const { data: agency, error } = await supabase
    .from('agencies')
    .select('id, name, slug, owner_user_id, created_at')
    .eq('id', params.id)
    .single()

  if (error || !agency) {
    redirect('/superadmin/agencies')
  }

  const activeTab = searchParams.tab || 'members'

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date))
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              {agency.name}
            </h1>
            {agency.slug && (
              <p className="text-gray-400 mt-2">
                Slug: <span className="font-mono bg-gray-800 px-2 py-1 rounded text-sm">{agency.slug}</span>
              </p>
            )}
          </div>
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Created {formatDate(agency.created_at)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-800">
          <nav className="-mb-px flex space-x-8">
            <a
              href={`/superadmin/agencies/${params.id}?tab=members`}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'members'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              Members
            </a>
            <a
              href={`/superadmin/agencies/${params.id}?tab=settings`}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              Settings
            </a>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'members' ? (
          <AgencyMembers agencyId={params.id} />
        ) : (
          <AgencySettings agencyId={params.id} initialName={agency.name} />
        )}
      </div>
    </div>
  )
}