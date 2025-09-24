import '../globals.css'

export default function AuthLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <div className='w-full h-screen bg-login'>
            <div className='flex items-center justify-center h-full'>
                <div className='max-w-md w-full mx-4 md-auto py-10 flex flex-col justify-center bg-white/10 backdrop-blur-lg rounded-lg p-8 shadow-lg border border-white/20'>
                    {children}
                </div>
            </div>
        </div>
    )
}
