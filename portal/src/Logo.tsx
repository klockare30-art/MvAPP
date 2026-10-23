import logoUrl from '../assets/logo.svg';

/** The brand mark (portal/assets/logo.svg). Decorative – the name is always written next to it. */
export function Logo() {
  return <img className="logo" src={logoUrl} alt="" aria-hidden />;
}
