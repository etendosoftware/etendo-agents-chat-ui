'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import Link from 'next/link';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

export default function LoginPage() {
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const locale = useLocale();
    const localePrefix = `/${locale}`;
    const t = useTranslations('auth.login');

    const formSchema = z.object({
        email: z.string().min(2, {
            message: t('form.email.validation'),
        }),
        password: z.string().min(2, {
            message: t('form.password.validation'),
        }),
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: ""
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true);
        try {
            setError(''); // Limpia el error anterior
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: values.email,
            password: values.password
        });

        if (signInError) {
            setError(signInError.message);
            return;
        }

        if (signInData.user) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', signInData.user.id)
                .single();

            if (profileError || !profile) {
                setError(t('messages.profileError'));
                return;
            }

            const destination = profile.role === 'admin' ? `${localePrefix}/admin` : localePrefix;
            window.location.assign(destination);
        }
        } catch (error) {
            setError(t('messages.unexpectedError'));
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleGoogleLogin() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}${localePrefix}/auth/callback`,
            },
        });
        if (error) {
            setError(error.message);
        }
    }

    return (
        <>
            <div className='flex items-center gap-2 border-b border-gray-300 pb-4'>
                <Image src={'/logo-etendo.png'} alt="Login Background" width={40} height={40} className="h-8 w-8" />
                <span className="text-md font-bold">Etendo</span>
            </div>
            <h1 className="text-2xl font-bold my-6">{t('title')}</h1>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 h-full">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('form.email.label')}</FormLabel>
                                <FormControl>
                                    <Input type='email' placeholder={t('form.email.placeholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('form.password.label')}</FormLabel>
                                <FormControl>
                                    <Input type='password' placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                        {isSubmitting ? t('form.submitting') : t('form.submit')}
                    </Button>
                    <Button type="button" onClick={handleGoogleLogin} className="w-full bg-blue-600 hover:bg-blue-700 cursor-pointer">
                        {t('form.google')}
                    </Button>
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>{t('messages.error')}</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </form>
            </Form>
            <div className="mt-4 text-center">
                <p>{t('register.text')} <Link href={`${localePrefix}/auth/register`} className="text-blue-600 hover:underline">{t('register.link')}</Link></p>
            </div>
        </>
    );
}
