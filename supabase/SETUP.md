# CleanPro i Drop Admin — wdrożenie testowe

Sklep zapisuje w Supabase pozycje, wybraną dostawę i metodę płatności, opłaty, rabat i wartość zamówienia. Dane kontaktowe i adresowe z formularza testowego pozostają w przeglądarce. Wszystkie metody płatności są symulowane i zachowują status `pending`. Administrator może przeprowadzić zapisane zamówienie testowe przez kolejne etapy realizacji. Historia zawiera poprzedni i nowy status, czas oraz UUID administratora.

## Supabase

- Projekt testowy ma ref `uxyqmwhnthlgzkfgszav`. Migrację `20261127222235_cleanpro_staging_orders.sql` zapisano w historii tego projektu. Numery czterech wcześniejszych migracji w repozytorium różnią się od numerów w historii zdalnej. Nie uruchamiaj ponownie migracji bazowych w istniejącym projekcie.
- Panel używa publicznego klucza i zalogowanego użytkownika z listy `drop_private.admins`. Członkostwo nadaje wyłącznie operator testowej bazy. Do przeglądarki nigdy nie trafia klucz serwerowy.
- `supabase/tests/order_integration.sql` tworzy syntetyczne dane w transakcji i wykonuje `rollback`. Sprawdza ceny, duplikaty, odrzucanie błędów, reguły statusów, historię i dostęp konta bez uprawnień.

## Vercel Preview

1. Dla gałęzi `staging/cleanpro-order-integration` użyj wdrożenia **Preview** z aktywnym Vercel Deployment Protection. Nie promuj wdrożenia do Production. Korzystaj z adresu Preview wygenerowanego dla commita lub gałęzi.
2. Ustaw poniższe zmienne w zakresie **Preview** tej gałęzi, a następnie przebuduj Preview.

   | Zmienna | Wartość |
   | --- | --- |
   | `DROP_STAGING_WEB_CHECKOUT` | `enabled` |
   | `DROP_STAGING_SUPABASE_URL` | `https://uxyqmwhnthlgzkfgszav.supabase.co` |
   | `DROP_STAGING_SERVICE_KEY` | Klucz serwerowy wyłącznie testowego projektu Supabase w zmiennych serwerowych Vercel |

   Trasa wymaga systemowych zmiennych Vercel `VERCEL_ENV` oraz `VERCEL_URL` lub `VERCEL_BRANCH_URL`. Trasa `/api/checkout-test` pozostaje dostępna tylko w Preview z oddzielną flagą `DROP_STAGING_CHECKOUT` i tokenem testowym. Sklep korzysta z `/api/checkout`.

3. Uruchom `node --test tests/*.test.cjs`. W Preview złóż zamówienie przy użyciu fikcyjnych danych, sprawdź identyczny UUID i kwotę w Drop Admin, zmień kolejno statusy i zweryfikuj historię. Płatność ma pozostać w statusie `pending`.
4. Aby wyłączyć zapis z podglądu, usuń flagę `DROP_STAGING_WEB_CHECKOUT` i przebuduj Preview. Publiczny adres produkcyjny i dotychczasowe dane pozostają niezależne od tej gałęzi.
