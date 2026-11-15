export type Locale = 'en' | 'ur';

const en = {
  tagline: 'Every celebration, one place',
  home: 'Home', search: 'Search', cart: 'Cart', account: 'Account',
  occasions: 'Shop by occasion', products: 'Cakes, flowers & gifts', services: 'Decor, catering & more',
  demo: 'DEMO', from: 'from', verified: 'Verified',
  searchPlaceholder: 'Try “mehndi decor” or “cake”', noResults: 'Nothing found. Try another word.',
  login: 'Log in', logout: 'Log out', phone: 'Mobile number', sendCode: 'Send code', code: '6-digit code', verify: 'Verify',
  loginToContinue: 'Log in to see your cart, orders and bookings.',
  chooseOption: 'Choose an option', quantity: 'Quantity', addToCart: 'Add to cart', added: 'Added to cart',
  emptyCart: 'Your cart is empty.', remove: 'Remove',
  deliverTo: 'Deliver to', recipientName: 'Recipient name', recipientPhone: 'Recipient phone', houseStreet: 'House / street', area: 'Area', saveAddress: 'Save address',
  deliveryDate: 'Delivery date', slot: 'Time slot', noSlots: 'No slots left on this day. Try another date.',
  giftMessage: 'Gift message (optional)', senderName: 'Your name (sender)', hideSender: 'Hide my name from the recipient',
  payment: 'Payment', cod: 'Cash on delivery', mockPay: 'Test payment (sandbox, no real money)', bankTransfer: 'Bank transfer',
  subtotal: 'Subtotal', delivery: 'Delivery', total: 'Total', placeOrder: 'Place order', orderPlaced: 'Order placed',
  myOrders: 'My orders', myBookings: 'My bookings', none: 'Nothing yet.',
  cancel: 'Cancel', cancelOrder: 'Cancel order', cancelBooking: 'Cancel booking', reason: 'Reason (optional)',
  refund: 'Refund', status: 'Status',
  packages: 'Packages', advance: 'Advance', eventDate: 'Event date', eventTime: 'Start time (HH:MM)', venueAddress: 'Venue address', guests: 'Guests',
  notes: 'Notes for the vendor', requestBooking: 'Request booking', bookingRequested: 'Booking requested. The vendor will reply within 24 hours.',
  payAdvance: 'Pay advance (test payment)', payRemaining: 'Pay remaining (test payment)', refundPolicy: 'Cancellation refund',
  hoursBefore: 'h before', language: 'اردو', sandboxNote: 'Payments in this build are sandbox only. No real money moves.',
  error: 'Something went wrong', retry: 'Try again', loading: 'Loading…',
  jazzcash: 'JazzCash wallet', easypaisa: 'Easypaisa wallet', sandboxTag: 'sandbox: no real money',
  paymentResult: 'Payment', paySucceeded: 'Payment received. Thank you!', payFailed: 'The payment did not go through. You have not been charged by RUNG.',
  payPending: 'We are waiting for the wallet to confirm this payment.', viewOrder: 'View order', viewBooking: 'View booking', checkAgain: 'Check again',
} as const;
export type Key = keyof typeof en;

const ur: Record<Key, string> = {
  tagline: 'ہر جشن، ایک جگہ',
  home: 'ہوم', search: 'تلاش', cart: 'کارٹ', account: 'اکاؤنٹ',
  occasions: 'موقع کے مطابق', products: 'کیک، پھول اور تحفے', services: 'سجاوٹ، کیٹرنگ اور مزید',
  demo: 'ڈیمو', from: 'سے شروع', verified: 'تصدیق شدہ',
  searchPlaceholder: '“مہندی ڈیکور” یا “کیک” لکھیں', noResults: 'کچھ نہیں ملا۔ کوئی اور لفظ آزمائیں۔',
  login: 'لاگ ان', logout: 'لاگ آؤٹ', phone: 'موبائل نمبر', sendCode: 'کوڈ بھیجیں', code: '6 ہندسوں کا کوڈ', verify: 'تصدیق کریں',
  loginToContinue: 'اپنا کارٹ، آرڈرز اور بکنگز دیکھنے کے لیے لاگ ان کریں۔',
  chooseOption: 'آپشن منتخب کریں', quantity: 'تعداد', addToCart: 'کارٹ میں ڈالیں', added: 'کارٹ میں شامل',
  emptyCart: 'آپ کا کارٹ خالی ہے۔', remove: 'ہٹائیں',
  deliverTo: 'کس کو پہنچانا ہے', recipientName: 'وصول کنندہ کا نام', recipientPhone: 'وصول کنندہ کا فون', houseStreet: 'مکان / گلی', area: 'علاقہ', saveAddress: 'پتہ محفوظ کریں',
  deliveryDate: 'ڈیلیوری کی تاریخ', slot: 'وقت', noSlots: 'اس دن کوئی وقت خالی نہیں۔ دوسری تاریخ آزمائیں۔',
  giftMessage: 'تحفے کا پیغام (اختیاری)', senderName: 'آپ کا نام (بھیجنے والا)', hideSender: 'وصول کنندہ سے میرا نام چھپائیں',
  payment: 'ادائیگی', cod: 'ڈیلیوری پر نقد', mockPay: 'ٹیسٹ ادائیگی (سینڈ باکس، اصل رقم نہیں)', bankTransfer: 'بینک ٹرانسفر',
  subtotal: 'رقم', delivery: 'ڈیلیوری', total: 'کل', placeOrder: 'آرڈر کریں', orderPlaced: 'آرڈر ہو گیا',
  myOrders: 'میرے آرڈرز', myBookings: 'میری بکنگز', none: 'ابھی کچھ نہیں۔',
  cancel: 'منسوخ', cancelOrder: 'آرڈر منسوخ کریں', cancelBooking: 'بکنگ منسوخ کریں', reason: 'وجہ (اختیاری)',
  refund: 'واپسی', status: 'صورتحال',
  packages: 'پیکجز', advance: 'ایڈوانس', eventDate: 'تقریب کی تاریخ', eventTime: 'شروع ہونے کا وقت (HH:MM)', venueAddress: 'جگہ کا پتہ', guests: 'مہمان',
  notes: 'وینڈر کے لیے ہدایات', requestBooking: 'بکنگ کی درخواست', bookingRequested: 'درخواست بھیج دی گئی۔ وینڈر 24 گھنٹے میں جواب دے گا۔',
  payAdvance: 'ایڈوانس ادا کریں (ٹیسٹ)', payRemaining: 'بقایا ادا کریں (ٹیسٹ)', refundPolicy: 'منسوخی پر واپسی',
  hoursBefore: 'گھنٹے پہلے', language: 'English', sandboxNote: 'اس ورژن میں ادائیگیاں صرف ٹیسٹ ہیں۔ اصل رقم منتقل نہیں ہوتی۔',
  error: 'کچھ غلط ہو گیا', retry: 'دوبارہ کوشش کریں', loading: 'لوڈ ہو رہا ہے…',
  jazzcash: 'جاز کیش والٹ', easypaisa: 'ایزی پیسہ والٹ', sandboxTag: 'سینڈ باکس: اصل رقم نہیں',
  paymentResult: 'ادائیگی', paySucceeded: 'ادائیگی موصول ہو گئی۔ شکریہ!', payFailed: 'ادائیگی مکمل نہیں ہوئی۔ رنگ نے کوئی رقم نہیں لی۔',
  payPending: 'ہم والٹ کی تصدیق کا انتظار کر رہے ہیں۔', viewOrder: 'آرڈر دیکھیں', viewBooking: 'بکنگ دیکھیں', checkAgain: 'دوبارہ دیکھیں',
};

export const DICT = { en, ur };
export const t = (l: Locale, k: Key): string => DICT[l][k];
/** Urdu field when the listing has one, otherwise English. */
export const pick = (l: Locale, enText: string, urText?: string | null) => (l === 'ur' && urText ? urText : enText);

const STATUS: Record<string, [string, string]> = {
  PENDING_PAYMENT: ['Awaiting payment', 'ادائیگی کا انتظار'], PLACED: ['Placed', 'آرڈر ہو گیا'], ACCEPTED: ['Accepted', 'قبول'], PREPARING: ['Preparing', 'تیاری'],
  OUT_FOR_DELIVERY: ['Out for delivery', 'روانہ'], DELIVERED: ['Delivered', 'پہنچ گیا'], CANCELLED: ['Cancelled', 'منسوخ'], REJECTED: ['Rejected by shop', 'دکان نے انکار کیا'],
  FAILED_DELIVERY: ['Delivery failed', 'ڈیلیوری ناکام'], REQUESTED: ['Requested', 'درخواست'], DECLINED: ['Declined', 'انکار'], EXPIRED: ['Expired', 'میعاد ختم'],
  CONFIRMED: ['Confirmed', 'کنفرم'], RESCHEDULE_REQUESTED: ['New date asked', 'نئی تاریخ کی درخواست'], COMPLETED: ['Completed', 'مکمل'], FULLY_PAID: ['Fully paid', 'مکمل ادائیگی'],
  NO_SHOW_VENDOR: ['Vendor no-show', 'وینڈر نہیں آیا'],
};
export const statusLabel = (l: Locale, s: string) => STATUS[s]?.[l === 'ur' ? 1 : 0] ?? s;
