import { ArrowLeft } from 'lucide-react';
import logoSubmark from '@assets/brand/builderwars-submark.svg';

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#111418] p-5">
      <div className="panel w-full max-w-md p-10 text-center">
        <img
          src={logoSubmark}
          alt="BuilderWars"
          className="mx-auto h-14 w-14"
        />
        <p className="eyebrow mt-6">404</p>
        <h1 className="display mt-3 text-3xl text-[#f7f4ed]">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-[#9ca3af]">
          This page doesn't exist or has moved.
        </p>
        <a
          href={import.meta.env.BASE_URL}
          className="btn btn-primary mt-7"
          data-testid="link-not-found-home"
        >
          <ArrowLeft size={16} />
          Back to BuilderWars
        </a>
      </div>
    </div>
  );
}
