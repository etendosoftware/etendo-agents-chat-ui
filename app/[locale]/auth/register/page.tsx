'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Keep for Google Login
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import Link from 'next/link';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

// Import the new server action
import { signUpWithJiraCheck } from './actions';

export default function RegisterPage() {
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false); // For loading state
    const locale = useLocale();
    const localePrefix = `/${locale}`;
    const t = useTranslations('auth.register');

    const formSchema = z.object({
        email: z.string().email({
            message: t('form.email.validation'),
        }),
        password: z.string().min(6, {
            message: t('form.password.validation'),
        }),
    });

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: ""
        },
    });

    // Updated onSubmit function
    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true);
        setError('');
        setSuccess('');

        const result = await signUpWithJiraCheck(values);

        if (result.error) {
            setError(result.error);
        } else if (result.success) {
            setSuccess(t('messages.success'));
            form.reset();
        }
        setIsSubmitting(false);
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
                                    <Input type='email' placeholder={t('form.email.placeholder')} {...field} disabled={isSubmitting} />
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
                                    <Input type='password' placeholder="••••••••" {...field} disabled={isSubmitting} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                        {isSubmitting ? t('form.submitting') : t('form.submit')}
                    </Button>
                    <Button type="button" onClick={handleGoogleLogin} className="w-full bg-blue-600 hover:bg-blue-700 cursor-pointer" disabled={isSubmitting}>
                        {t('form.google')}
                    </Button>
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>{t('messages.error')}</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className='bg-green-100 border-green-400 text-green-700'>
                            <AlertTitle>{t('messages.successTitle')}</AlertTitle>
                            <AlertDescription className='text-green-800'>{success}</AlertDescription>
                        </Alert>
                    )}
                </form>
            </Form>
            <div className="mt-4 text-center">
                <p>{t('login.text')} <Link href={`${localePrefix}/auth/login`} className="text-blue-600 hover:underline">{t('login.link')}</Link></p>
            </div>
        </>
    );
}
