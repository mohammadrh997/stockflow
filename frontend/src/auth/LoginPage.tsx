import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { ApiError, applyFieldErrors } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePageTitle } from '@/lib/usePageTitle'
import type { LoginLocationState } from './RequireAuth'
import { useAuth } from './useAuth'

type LoginForm = { username: string; password: string }

export function LoginPage() {
  usePageTitle('Log in')
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LoginLocationState
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>()

  if (token && !isSubmitting) return <Navigate to={state.from ?? '/'} replace />

  async function onSubmit(values: LoginForm) {
    setFormError(null)
    try {
      await login(values.username, values.password)
      navigate(state.from ?? '/', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFormError('Incorrect email or password.')
        return
      }
      const unmatched = applyFieldErrors(error, ['username', 'password'], setError)
      setFormError(unmatched.join(' ') || null)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <Logo />
          </CardTitle>
          <CardDescription>Log in with your work email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {state.expired && !formError && (
              <ErrorMessage message="Your session expired. Please log in again." />
            )}
            {formError && <ErrorMessage message={formError} />}
            <div className="grid gap-2">
              <Label htmlFor="username">Email</Label>
              <Input
                id="username"
                type="email"
                autoComplete="username"
                aria-invalid={errors.username ? true : undefined}
                {...register('username', { required: 'Enter your email.' })}
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                {...register('password', { required: 'Enter your password.' })}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
