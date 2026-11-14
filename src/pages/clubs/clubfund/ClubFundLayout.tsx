import { Outlet } from 'react-router-dom';
import { ClubFundProvider } from './state';

/** Shares the ClubFund session, wallet link and wallet connection between the ClubFund pages. */
export default function ClubFundLayout() {
  return (
    <ClubFundProvider>
      <Outlet />
    </ClubFundProvider>
  );
}
