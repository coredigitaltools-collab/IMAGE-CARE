interface WelcomeHeaderProps {
  userName: string
  businessName: string
}

export function WelcomeHeader({ userName, businessName }: WelcomeHeaderProps) {
  const firstName = userName.split(' ')[0]
  const today = new Date().toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">
        Welcome back, {firstName}
      </h1>
      <p className="mt-0.5 text-sm text-ink-500">
        {businessName} · {today}
      </p>
    </div>
  )
}
