import { z } from 'zod';

const text = z.string().min(1).max(500);
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const customerIdSchema = z.string().regex(/^cust_[A-Za-z0-9_-]+$/);
export const productIdSchema = z.string().regex(/^prod_[A-Za-z0-9_-]+$/);
export const checkoutIdSchema = z.string().regex(/^bill_[A-Za-z0-9_-]+$/);
export const subscriptionIdSchema = z.string().regex(/^subs_[A-Za-z0-9_-]+$/);
export const cycleSchema = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'ANNUALLY']);
export const checkoutStatusSchema = z.enum([
    'PENDING',
    'EXPIRED',
    'CANCELLED',
    'PAID',
    'REFUNDED',
    'REDEEMED',
]);
const methodSchema = z.enum(['PIX', 'CARD', 'BOLETO']);
const subscriptionMethodSchema = z.enum(['PIX', 'CARD']);
const metadataSchema = z.record(z.string(), z.unknown());
const itemSchema = z
    .object({ id: productIdSchema, quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) })
    .strict();
const cardSchema = z
    .object({
        maxInstallments: z.number().int().min(1).max(12),
        passFeesToCustomer: z.boolean().optional(),
    })
    .strict();

export interface AbacatePayCredentials {
    apiKey: string;
    devMode: boolean;
}
export const customerInputSchema = z
    .object({
        email: z.email(),
        name: text.optional(),
        cellphone: text.optional(),
        taxId: text.optional(),
        zipCode: text.optional(),
        metadata: z.record(z.string(), z.string()).optional(),
    })
    .strict();
export const productInputSchema = z
    .object({
        externalId: text,
        name: text,
        price: cents.refine((value) => value > 0),
        currency: z.literal('BRL'),
        description: z.string().max(5000).optional(),
        cycle: cycleSchema.nullable().optional(),
        trialDays: z.number().int().min(1).max(90).optional(),
    })
    .strict();
export const checkoutInputSchema = z
    .object({
        externalId: text,
        items: z.array(itemSchema).min(1),
        customerId: customerIdSchema.optional(),
        methods: z.array(methodSchema).min(1).optional(),
        returnUrl: z.url().optional(),
        completionUrl: z.url().optional(),
        metadata: metadataSchema.optional(),
        card: cardSchema.optional(),
    })
    .strict();
export const subscriptionCheckoutInputSchema = checkoutInputSchema.extend({
    items: z.array(itemSchema).length(1),
    methods: z.array(subscriptionMethodSchema).min(1).optional(),
    retryPolicy: z
        .object({
            maxRetry: z.number().int().min(1).max(10).optional(),
            retryEvery: z.number().int().min(1).max(30).optional(),
        })
        .strict()
        .optional(),
});
const cursorShape = {
    after: text.optional(),
    before: text.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
};
export const customerQuerySchema = z
    .object({
        id: customerIdSchema.optional(),
        email: z.email().optional(),
        taxId: text.optional(),
    })
    .strict();
export const productQuerySchema = z
    .object({ id: productIdSchema.optional(), externalId: text.optional(), name: text.optional() })
    .strict();
export const checkoutQuerySchema = z
    .object({
        id: checkoutIdSchema.optional(),
        externalId: text.optional(),
        customerId: customerIdSchema.optional(),
        method: methodSchema.optional(),
    })
    .strict();
export const subscriptionCheckoutQuerySchema = checkoutQuerySchema.extend({
    method: subscriptionMethodSchema.optional(),
});
export const subscriptionQuerySchema = z
    .object({
        id: subscriptionIdSchema.optional(),
        externalId: text.optional(),
        customerId: customerIdSchema.optional(),
    })
    .strict();
export const customerListQuerySchema = z
    .object({
        ...cursorShape,
        ...customerQuerySchema.shape,
        name: text.optional(),
        cellphone: text.optional(),
    })
    .strict();
export const productListQuerySchema = z
    .object({
        ...cursorShape,
        id: productIdSchema.optional(),
        externalId: text.optional(),
        status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
        keyword: text.optional(),
        name: text.optional(),
        currency: z.literal('BRL').optional(),
    })
    .strict();
export const checkoutListQuerySchema = z
    .object({
        ...cursorShape,
        ...checkoutQuerySchema.shape,
        status: checkoutStatusSchema.optional(),
        keyword: text.optional(),
    })
    .strict();
export const subscriptionCheckoutListQuerySchema = checkoutListQuerySchema.extend({
    method: subscriptionMethodSchema.optional(),
});
export const subscriptionListQuerySchema = z
    .object({
        ...cursorShape,
        status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
        checkoutId: checkoutIdSchema.optional(),
    })
    .strict();
export const cancelSubscriptionInputSchema = z.object({ id: subscriptionIdSchema }).strict();
export const deleteSubscriptionCheckoutInputSchema = z.object({ id: checkoutIdSchema }).strict();

export const customerSchema = z
    .object({
        id: customerIdSchema,
        devMode: z.boolean(),
        email: z.email(),
        name: z.string().nullish(),
        cellphone: z.string().nullish(),
        taxId: z.string().nullish(),
        zipCode: z.string().nullish(),
        country: z.string().nullish(),
        metadata: metadataSchema.nullish(),
    })
    .passthrough();
export const productSchema = z
    .object({
        id: productIdSchema,
        externalId: text,
        devMode: z.boolean(),
        name: text,
        price: cents,
        currency: z.literal('BRL'),
        cycle: cycleSchema.nullish(),
        status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
        description: z.string().nullish(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    })
    .passthrough();
export const checkoutSchema = z
    .object({
        id: checkoutIdSchema,
        externalId: text.nullable(),
        devMode: z.boolean(),
        url: z.string(),
        amount: cents,
        paidAmount: cents.nullish(),
        status: checkoutStatusSchema,
        items: z.array(itemSchema),
        customerId: customerIdSchema.nullish(),
        currency: z.literal('BRL').optional(),
        methods: z.array(methodSchema).optional(),
        frequency: z.enum(['ONE_TIME', 'SUBSCRIPTION']).optional(),
        receiptUrl: z.string().nullish(),
        metadata: metadataSchema.nullish(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    })
    .passthrough();
export const subscriptionSchema = z
    .object({
        id: subscriptionIdSchema,
        checkoutId: checkoutIdSchema.nullable(),
        customerId: customerIdSchema,
        amount: cents,
        status: z.enum(['PENDING', 'ACTIVE', 'CANCELLED']),
        method: subscriptionMethodSchema,
        devMode: z.boolean(),
        currency: z.literal('BRL').optional(),
        coupons: z.array(z.string()).optional(),
        trialDays: z.number().int().nonnegative().nullish(),
        trialEndsAt: z.string().nullish(),
        retryPolicy: z
            .object({ maxRetry: z.number().int(), retryEvery: z.number().int() })
            .optional(),
        currentPeriodStart: z.string().nullish(),
        currentPeriodEnd: z.string().nullish(),
        nextChargeAt: z.string().nullish(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    })
    .passthrough();
export const paginationSchema = z
    .object({ hasMore: z.boolean(), next: text.nullable(), before: text.nullable() })
    .passthrough();
export const storeSchema = z
    .object({
        id: z.string().regex(/^store_[A-Za-z0-9_-]+$/),
        name: z.string(),
        balance: z.object({ available: cents, pending: cents, blocked: cents }).passthrough(),
    })
    .passthrough();

export type AbacatePayCustomer = z.infer<typeof customerSchema>;
export type AbacatePayProduct = z.infer<typeof productSchema>;
export type AbacatePayCheckout = z.infer<typeof checkoutSchema>;
export type AbacatePaySubscription = z.infer<typeof subscriptionSchema>;
export type AbacatePayStore = z.infer<typeof storeSchema>;
export type AbacatePayPagination = z.infer<typeof paginationSchema>;
export interface AbacatePayPage<T> {
    data: T[];
    pagination: AbacatePayPagination;
}
export type CreateCustomerInput = z.infer<typeof customerInputSchema>;
export type CreateProductInput = z.infer<typeof productInputSchema>;
export type CreateCheckoutInput = z.infer<typeof checkoutInputSchema>;
export type CreateSubscriptionCheckoutInput = z.infer<typeof subscriptionCheckoutInputSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type CheckoutQuery = z.infer<typeof checkoutQuerySchema>;
export type SubscriptionCheckoutQuery = z.infer<typeof subscriptionCheckoutQuerySchema>;
export type SubscriptionQuery = z.infer<typeof subscriptionQuerySchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type CheckoutListQuery = z.infer<typeof checkoutListQuerySchema>;
export type SubscriptionCheckoutListQuery = z.infer<typeof subscriptionCheckoutListQuerySchema>;
export type SubscriptionListQuery = z.infer<typeof subscriptionListQuerySchema>;
export interface AbacatePayPayment {
    id: string;
    externalId?: string | null;
    amount: number;
    paidAmount: number | null;
    status: string;
    methods?: Array<'PIX' | 'CARD' | 'BOLETO'>;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: unknown;
}
export interface AbacatePayPort {
    createCustomer(
        credentials: AbacatePayCredentials,
        input: CreateCustomerInput,
    ): Promise<AbacatePayCustomer>;
    getCustomer(
        credentials: AbacatePayCredentials,
        query: CustomerQuery,
    ): Promise<AbacatePayCustomer>;
    listCustomers(
        credentials: AbacatePayCredentials,
        query?: CustomerListQuery,
    ): Promise<AbacatePayPage<AbacatePayCustomer>>;
    createProduct(
        credentials: AbacatePayCredentials,
        input: CreateProductInput,
    ): Promise<AbacatePayProduct>;
    getProduct(credentials: AbacatePayCredentials, query: ProductQuery): Promise<AbacatePayProduct>;
    listProducts(
        credentials: AbacatePayCredentials,
        query?: ProductListQuery,
    ): Promise<AbacatePayPage<AbacatePayProduct>>;
    createCheckout(
        credentials: AbacatePayCredentials,
        input: CreateCheckoutInput,
    ): Promise<AbacatePayCheckout>;
    getCheckout(
        credentials: AbacatePayCredentials,
        query: CheckoutQuery,
    ): Promise<AbacatePayCheckout>;
    listCheckouts(
        credentials: AbacatePayCredentials,
        query?: CheckoutListQuery,
    ): Promise<AbacatePayPage<AbacatePayCheckout>>;
    createSubscriptionCheckout(
        credentials: AbacatePayCredentials,
        input: CreateSubscriptionCheckoutInput,
    ): Promise<AbacatePayCheckout>;
    getSubscriptionCheckout(
        credentials: AbacatePayCredentials,
        query: SubscriptionCheckoutQuery,
    ): Promise<AbacatePayCheckout>;
    listSubscriptionCheckouts(
        credentials: AbacatePayCredentials,
        query?: SubscriptionCheckoutListQuery,
    ): Promise<AbacatePayPage<AbacatePayCheckout>>;
    deleteSubscriptionCheckout(
        credentials: AbacatePayCredentials,
        input: { id: string },
    ): Promise<AbacatePayCheckout>;
    getSubscription(
        credentials: AbacatePayCredentials,
        query: SubscriptionQuery,
    ): Promise<AbacatePaySubscription>;
    listSubscriptions(
        credentials: AbacatePayCredentials,
        query?: SubscriptionListQuery,
    ): Promise<AbacatePayPage<AbacatePaySubscription>>;
    cancelSubscription(
        credentials: AbacatePayCredentials,
        input: { id: string },
    ): Promise<AbacatePaySubscription>;
    getStore(credentials: AbacatePayCredentials): Promise<AbacatePayStore>;
}
