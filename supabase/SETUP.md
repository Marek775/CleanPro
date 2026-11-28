# CleanPro i Drop Admin — wdrożenie testowe

Sklep zapisuje w Supabase pozycje, wybraną dostawę i metodę płatności, opłaty, rabat i wartość zamówienia. Checkout zapisuje fikcyjne dane odbiorcy w oddzielnej tabeli. Dane dostawy odczyta wyłącznie administrator. Dane odbiorcy nie są zapisywane w localStorage ani sessionStorage. Wszystkie metody płatności są symulowane i zachowują status `pending`. Administrator może przeprowadzić zapisane zamówienie testowe przez kolejne etapy realizacji. Historia zawiera poprzedni i nowy status, czas oraz UUID administratora.

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


## Wysyłka testowa w Drop Admin

W szczegółach zamówienia CleanPro wybierz osobę realizującą wysyłkę. Przy wysyłce własnej zapisz przewoźnika i numer śledzenia. Przy wysyłce przez dostawcę zapisz również numer zlecenia nadany przez dostawcę. Możesz zapisać sam wybór sposobu realizacji i uzupełnić pozostałe pola później. Status „Wysłane” wymaga kompletu danych.

W panelu widnieją historia zmian danych wysyłki i historia zmian statusu. Scenariusze testowe nie generują etykiet ani zleceń w systemach dostawców. Używaj fikcyjnych numerów śledzenia i zleceń. Test bazy znajduje się w `supabase/tests/shipping_routes.sql`.

Przy zamówieniach testowych zapisanych z danymi odbiorcy Drop Admin pokazuje informacje potrzebne do dostawy. Dla wysyłki przez dostawcę możesz skopiować tekst zlecenia oznaczony jako testowy. Panel nie przekazuje danych dostawcy automatycznie. Test bazy znajduje się w `supabase/tests/delivery_details.sql`.

## Stripe Sandbox w Preview

Stripe Checkout obsługuje testową kartę w PLN. Pozostałe metody sklepu pozostają symulacjami. Płatność testowa kartą nie może wejść do realizacji przed potwierdzeniem Stripe. Pobranie zachowuje dotychczasową ścieżkę. Sklep przekazuje Stripe kwotę z Supabase i identyfikator zamówienia. Formularz Stripe obsługuj wyłącznie danymi testowymi.

W dedykowanym Stripe Sandbox utwórz przeznaczony do niego webhook dla `payment_intent.succeeded`, `checkout.session.expired` i `charge.refunded`. Endpoint w tej wersji to `/api/stripe-webhook`. Stripe musi mieć autoryzowaną ścieżkę do endpointu na chronionym Preview. Podczas testu można przekazać zdarzenia przez Stripe CLI i lokalny serwer funkcji z konfiguracją testową. Nie wyłączaj ochrony całego Preview dla webhooka.

Po przygotowaniu odbioru zdarzeń zapisz poniższe zmienne serwerowe wyłącznie dla Preview gałęzi testowej i przebuduj podgląd.

| Zmienna | Wartość |
| --- | --- |
| `DROP_STRIPE_SECRET_KEY` | Serwerowy klucz dedykowanego sandboxa, od `sk_test_` lub `rk_test_` |
| `DROP_STRIPE_WEBHOOK_SECRET` | Sekret podpisu używanego endpointu, od `whsec_` |
| `DROP_STRIPE_SANDBOX` | `enabled` |

Przetestuj kartę sukcesu, powrót po anulowaniu i wygaśnięcie sesji, ponowne dostarczenie tego samego zdarzenia oraz pełny zwrot z panelu Stripe Sandbox. Płatność jest oczekująca po powrocie z nieopłaconej sesji do czasu jej wygaśnięcia. Zwroty częściowe nie zmieniają statusu na „Zwrot”. Testy automatyczne: `node --test tests/*.test.cjs` i `supabase/tests/stripe_sandbox.sql`.
