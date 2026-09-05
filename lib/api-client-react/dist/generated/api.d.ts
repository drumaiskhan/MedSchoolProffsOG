import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { AdminDashboard, AuthSession, Flashcard, HealthStatus, ListMcqsParams, ListFlashcardsParams, ListModulesParams, ListPaymentsParams, ListResourcesParams, ListStudentsParams, ListSubjectsParams, ListTopicsParams, LoginInput, Mcq, McqInput, MembershipPlan, MembershipPlanInput, MembershipPlanUpdate, Module, ModuleInput, Notification, Payment, PaymentInput, RegisterInput, RejectPaymentInput, Resource, Student, StudentDashboard, Subject, Topic, User } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getLoginUrl: () => string;
/**
 * @summary Sign in
 */
export declare const login: (loginInput: LoginInput, options?: Parameters<typeof customFetch>[1]) => Promise<AuthSession>;
export declare const getLoginMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export type LoginMutationResult = NonNullable<Awaited<ReturnType<typeof login>>>;
export type LoginMutationBody = BodyType<LoginInput>;
export type LoginMutationError = ErrorType<unknown>;
/**
* @summary Sign in
*/
export declare const useLogin: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<LoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<LoginInput>;
}, TContext>;
export declare const getRegisterUrl: () => string;
/**
 * @summary Register a student
 */
export declare const register: (registerInput: RegisterInput, options?: Parameters<typeof customFetch>[1]) => Promise<AuthSession>;
export declare const getRegisterMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof register>>, TError, {
        data: BodyType<RegisterInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof register>>, TError, {
    data: BodyType<RegisterInput>;
}, TContext>;
export type RegisterMutationResult = NonNullable<Awaited<ReturnType<typeof register>>>;
export type RegisterMutationBody = BodyType<RegisterInput>;
export type RegisterMutationError = ErrorType<unknown>;
/**
* @summary Register a student
*/
export declare const useRegister: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof register>>, TError, {
        data: BodyType<RegisterInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof register>>, TError, {
    data: BodyType<RegisterInput>;
}, TContext>;
export declare const getGetCurrentUserUrl: () => string;
/**
 * @summary Current authenticated user
 */
export declare const getCurrentUser: (options?: Parameters<typeof customFetch>[1]) => Promise<User>;
export declare const getGetCurrentUserQueryKey: () => readonly ["/api/auth/me"];
export declare const getGetCurrentUserQueryOptions: <TData = Awaited<ReturnType<typeof getCurrentUser>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCurrentUser>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCurrentUser>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCurrentUserQueryResult = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
export type GetCurrentUserQueryError = ErrorType<unknown>;
/**
 * @summary Current authenticated user
 */
export declare function useGetCurrentUser<TData = Awaited<ReturnType<typeof getCurrentUser>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCurrentUser>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetStudentDashboardUrl: () => string;
/**
 * @summary Student dashboard overview
 */
export declare const getStudentDashboard: (options?: Parameters<typeof customFetch>[1]) => Promise<StudentDashboard>;
export declare const getGetStudentDashboardQueryKey: () => readonly ["/api/student/dashboard"];
export declare const getGetStudentDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getStudentDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStudentDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getStudentDashboard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetStudentDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getStudentDashboard>>>;
export type GetStudentDashboardQueryError = ErrorType<unknown>;
/**
 * @summary Student dashboard overview
 */
export declare function useGetStudentDashboard<TData = Awaited<ReturnType<typeof getStudentDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStudentDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAdminDashboardUrl: () => string;
/**
 * @summary Admin dashboard overview
 */
export declare const getAdminDashboard: (options?: Parameters<typeof customFetch>[1]) => Promise<AdminDashboard>;
export declare const getGetAdminDashboardQueryKey: () => readonly ["/api/admin/dashboard"];
export declare const getGetAdminDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getAdminDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminDashboard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminDashboard>>>;
export type GetAdminDashboardQueryError = ErrorType<unknown>;
/**
 * @summary Admin dashboard overview
 */
export declare function useGetAdminDashboard<TData = Awaited<ReturnType<typeof getAdminDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListMembershipPlansUrl: () => string;
/**
 * @summary List active membership plans
 */
export declare const listMembershipPlans: (options?: Parameters<typeof customFetch>[1]) => Promise<MembershipPlan[]>;
export declare const getListMembershipPlansQueryKey: () => readonly ["/api/membership-plans"];
export declare const getListMembershipPlansQueryOptions: <TData = Awaited<ReturnType<typeof listMembershipPlans>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMembershipPlans>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listMembershipPlans>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListMembershipPlansQueryResult = NonNullable<Awaited<ReturnType<typeof listMembershipPlans>>>;
export type ListMembershipPlansQueryError = ErrorType<unknown>;
/**
 * @summary List active membership plans
 */
export declare function useListMembershipPlans<TData = Awaited<ReturnType<typeof listMembershipPlans>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMembershipPlans>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateMembershipPlanUrl: () => string;
/**
 * @summary Create membership plan
 */
export declare const createMembershipPlan: (membershipPlanInput: MembershipPlanInput, options?: Parameters<typeof customFetch>[1]) => Promise<MembershipPlan>;
export declare const getCreateMembershipPlanMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMembershipPlan>>, TError, {
        data: BodyType<MembershipPlanInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createMembershipPlan>>, TError, {
    data: BodyType<MembershipPlanInput>;
}, TContext>;
export type CreateMembershipPlanMutationResult = NonNullable<Awaited<ReturnType<typeof createMembershipPlan>>>;
export type CreateMembershipPlanMutationBody = BodyType<MembershipPlanInput>;
export type CreateMembershipPlanMutationError = ErrorType<unknown>;
/**
* @summary Create membership plan
*/
export declare const useCreateMembershipPlan: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMembershipPlan>>, TError, {
        data: BodyType<MembershipPlanInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createMembershipPlan>>, TError, {
    data: BodyType<MembershipPlanInput>;
}, TContext>;
export declare const getUpdateMembershipPlanUrl: (id: number) => string;
/**
 * @summary Update membership plan
 */
export declare const updateMembershipPlan: (id: number, membershipPlanUpdate: MembershipPlanUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<MembershipPlan>;
export declare const getUpdateMembershipPlanMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateMembershipPlan>>, TError, {
        id: number;
        data: BodyType<MembershipPlanUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateMembershipPlan>>, TError, {
    id: number;
    data: BodyType<MembershipPlanUpdate>;
}, TContext>;
export type UpdateMembershipPlanMutationResult = NonNullable<Awaited<ReturnType<typeof updateMembershipPlan>>>;
export type UpdateMembershipPlanMutationBody = BodyType<MembershipPlanUpdate>;
export type UpdateMembershipPlanMutationError = ErrorType<unknown>;
/**
* @summary Update membership plan
*/
export declare const useUpdateMembershipPlan: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateMembershipPlan>>, TError, {
        id: number;
        data: BodyType<MembershipPlanUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateMembershipPlan>>, TError, {
    id: number;
    data: BodyType<MembershipPlanUpdate>;
}, TContext>;
export declare const getListPaymentsUrl: (params?: ListPaymentsParams) => string;
/**
 * @summary List payment submissions
 */
export declare const listPayments: (params?: ListPaymentsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Payment[]>;
export declare const getListPaymentsQueryKey: (params?: ListPaymentsParams) => readonly ["/api/payments", ...ListPaymentsParams[]];
export declare const getListPaymentsQueryOptions: <TData = Awaited<ReturnType<typeof listPayments>>, TError = ErrorType<unknown>>(params?: ListPaymentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPayments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPayments>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPaymentsQueryResult = NonNullable<Awaited<ReturnType<typeof listPayments>>>;
export type ListPaymentsQueryError = ErrorType<unknown>;
/**
 * @summary List payment submissions
 */
export declare function useListPayments<TData = Awaited<ReturnType<typeof listPayments>>, TError = ErrorType<unknown>>(params?: ListPaymentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPayments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSubmitPaymentUrl: () => string;
/**
 * @summary Submit payment proof
 */
export declare const submitPayment: (paymentInput: PaymentInput, options?: Parameters<typeof customFetch>[1]) => Promise<Payment>;
export declare const getSubmitPaymentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitPayment>>, TError, {
        data: BodyType<PaymentInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof submitPayment>>, TError, {
    data: BodyType<PaymentInput>;
}, TContext>;
export type SubmitPaymentMutationResult = NonNullable<Awaited<ReturnType<typeof submitPayment>>>;
export type SubmitPaymentMutationBody = BodyType<PaymentInput>;
export type SubmitPaymentMutationError = ErrorType<unknown>;
/**
* @summary Submit payment proof
*/
export declare const useSubmitPayment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitPayment>>, TError, {
        data: BodyType<PaymentInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof submitPayment>>, TError, {
    data: BodyType<PaymentInput>;
}, TContext>;
export declare const getApprovePaymentUrl: (id: number) => string;
/**
 * @summary Approve payment and activate membership
 */
export declare const approvePayment: (id: number, options?: Parameters<typeof customFetch>[1]) => Promise<Payment>;
export declare const getApprovePaymentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof approvePayment>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof approvePayment>>, TError, {
    id: number;
}, TContext>;
export type ApprovePaymentMutationResult = NonNullable<Awaited<ReturnType<typeof approvePayment>>>;
export type ApprovePaymentMutationError = ErrorType<unknown>;
/**
* @summary Approve payment and activate membership
*/
export declare const useApprovePayment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof approvePayment>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof approvePayment>>, TError, {
    id: number;
}, TContext>;
export declare const getRejectPaymentUrl: (id: number) => string;
/**
 * @summary Reject payment proof
 */
export declare const rejectPayment: (id: number, rejectPaymentInput: RejectPaymentInput, options?: Parameters<typeof customFetch>[1]) => Promise<Payment>;
export declare const getRejectPaymentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof rejectPayment>>, TError, {
        id: number;
        data: BodyType<RejectPaymentInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof rejectPayment>>, TError, {
    id: number;
    data: BodyType<RejectPaymentInput>;
}, TContext>;
export type RejectPaymentMutationResult = NonNullable<Awaited<ReturnType<typeof rejectPayment>>>;
export type RejectPaymentMutationBody = BodyType<RejectPaymentInput>;
export type RejectPaymentMutationError = ErrorType<unknown>;
/**
* @summary Reject payment proof
*/
export declare const useRejectPayment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof rejectPayment>>, TError, {
        id: number;
        data: BodyType<RejectPaymentInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof rejectPayment>>, TError, {
    id: number;
    data: BodyType<RejectPaymentInput>;
}, TContext>;
export declare const getListModulesUrl: (params?: ListModulesParams) => string;
/**
 * @summary List learning modules
 */
export declare const listModules: (params?: ListModulesParams, options?: Parameters<typeof customFetch>[1]) => Promise<Module[]>;
export declare const getListModulesQueryKey: (params?: ListModulesParams) => readonly ["/api/modules", ...ListModulesParams[]];
export declare const getListModulesQueryOptions: <TData = Awaited<ReturnType<typeof listModules>>, TError = ErrorType<unknown>>(params?: ListModulesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listModules>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listModules>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListModulesQueryResult = NonNullable<Awaited<ReturnType<typeof listModules>>>;
export type ListModulesQueryError = ErrorType<unknown>;
/**
 * @summary List learning modules
 */
export declare function useListModules<TData = Awaited<ReturnType<typeof listModules>>, TError = ErrorType<unknown>>(params?: ListModulesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listModules>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateModuleUrl: () => string;
/**
 * @summary Create module
 */
export declare const createModule: (moduleInput: ModuleInput, options?: Parameters<typeof customFetch>[1]) => Promise<Module>;
export declare const getCreateModuleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createModule>>, TError, {
        data: BodyType<ModuleInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createModule>>, TError, {
    data: BodyType<ModuleInput>;
}, TContext>;
export type CreateModuleMutationResult = NonNullable<Awaited<ReturnType<typeof createModule>>>;
export type CreateModuleMutationBody = BodyType<ModuleInput>;
export type CreateModuleMutationError = ErrorType<unknown>;
/**
* @summary Create module
*/
export declare const useCreateModule: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createModule>>, TError, {
        data: BodyType<ModuleInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createModule>>, TError, {
    data: BodyType<ModuleInput>;
}, TContext>;
export declare const getListSubjectsUrl: (params?: ListSubjectsParams) => string;
export declare const listSubjects: (params?: ListSubjectsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Subject[]>;
export declare const getListSubjectsQueryKey: (params?: ListSubjectsParams) => readonly ["/api/subjects", ...ListSubjectsParams[]];
export declare const getListSubjectsQueryOptions: <TData = Awaited<ReturnType<typeof listSubjects>>, TError = ErrorType<unknown>>(params?: ListSubjectsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listSubjects>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listSubjects>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListSubjectsQueryResult = NonNullable<Awaited<ReturnType<typeof listSubjects>>>;
export type ListSubjectsQueryError = ErrorType<unknown>;
export declare function useListSubjects<TData = Awaited<ReturnType<typeof listSubjects>>, TError = ErrorType<unknown>>(params?: ListSubjectsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listSubjects>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListTopicsUrl: (params?: ListTopicsParams) => string;
export declare const listTopics: (params?: ListTopicsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Topic[]>;
export declare const getListTopicsQueryKey: (params?: ListTopicsParams) => readonly ["/api/topics", ...ListTopicsParams[]];
export declare const getListTopicsQueryOptions: <TData = Awaited<ReturnType<typeof listTopics>>, TError = ErrorType<unknown>>(params?: ListTopicsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTopics>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTopics>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTopicsQueryResult = NonNullable<Awaited<ReturnType<typeof listTopics>>>;
export type ListTopicsQueryError = ErrorType<unknown>;
export declare function useListTopics<TData = Awaited<ReturnType<typeof listTopics>>, TError = ErrorType<unknown>>(params?: ListTopicsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTopics>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListMcqsUrl: (params?: ListMcqsParams) => string;
export declare const listMcqs: (params?: ListMcqsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Mcq[]>;
export declare const getListMcqsQueryKey: (params?: ListMcqsParams) => readonly ["/api/mcqs", ...ListMcqsParams[]];
export declare const getListMcqsQueryOptions: <TData = Awaited<ReturnType<typeof listMcqs>>, TError = ErrorType<unknown>>(params?: ListMcqsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMcqs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listMcqs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListMcqsQueryResult = NonNullable<Awaited<ReturnType<typeof listMcqs>>>;
export type ListMcqsQueryError = ErrorType<unknown>;
export declare function useListMcqs<TData = Awaited<ReturnType<typeof listMcqs>>, TError = ErrorType<unknown>>(params?: ListMcqsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMcqs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateMcqUrl: () => string;
/**
 * @summary Create MCQ draft
 */
export declare const createMcq: (mcqInput: McqInput, options?: Parameters<typeof customFetch>[1]) => Promise<Mcq>;
export declare const getCreateMcqMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMcq>>, TError, {
        data: BodyType<McqInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createMcq>>, TError, {
    data: BodyType<McqInput>;
}, TContext>;
export type CreateMcqMutationResult = NonNullable<Awaited<ReturnType<typeof createMcq>>>;
export type CreateMcqMutationBody = BodyType<McqInput>;
export type CreateMcqMutationError = ErrorType<unknown>;
/**
* @summary Create MCQ draft
*/
export declare const useCreateMcq: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createMcq>>, TError, {
        data: BodyType<McqInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createMcq>>, TError, {
    data: BodyType<McqInput>;
}, TContext>;
export declare const getListFlashcardsUrl: (params?: ListFlashcardsParams) => string;
export declare const listFlashcards: (params?: ListFlashcardsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Flashcard[]>;
export declare const getListFlashcardsQueryKey: (params?: ListFlashcardsParams) => readonly ["/api/flashcards", ...ListFlashcardsParams[]];
export declare const getListFlashcardsQueryOptions: <TData = Awaited<ReturnType<typeof listFlashcards>>, TError = ErrorType<unknown>>(params?: ListFlashcardsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFlashcards>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFlashcards>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFlashcardsQueryResult = NonNullable<Awaited<ReturnType<typeof listFlashcards>>>;
export type ListFlashcardsQueryError = ErrorType<unknown>;
export declare function useListFlashcards<TData = Awaited<ReturnType<typeof listFlashcards>>, TError = ErrorType<unknown>>(params?: ListFlashcardsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFlashcards>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListResourcesUrl: (params?: ListResourcesParams) => string;
export declare const listResources: (params?: ListResourcesParams, options?: Parameters<typeof customFetch>[1]) => Promise<Resource[]>;
export declare const getListResourcesQueryKey: (params?: ListResourcesParams) => readonly ["/api/resources", ...ListResourcesParams[]];
export declare const getListResourcesQueryOptions: <TData = Awaited<ReturnType<typeof listResources>>, TError = ErrorType<unknown>>(params?: ListResourcesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listResources>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listResources>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListResourcesQueryResult = NonNullable<Awaited<ReturnType<typeof listResources>>>;
export type ListResourcesQueryError = ErrorType<unknown>;
export declare function useListResources<TData = Awaited<ReturnType<typeof listResources>>, TError = ErrorType<unknown>>(params?: ListResourcesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listResources>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListStudentsUrl: (params?: ListStudentsParams) => string;
export declare const listStudents: (params?: ListStudentsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Student[]>;
export declare const getListStudentsQueryKey: (params?: ListStudentsParams) => readonly ["/api/students", ...ListStudentsParams[]];
export declare const getListStudentsQueryOptions: <TData = Awaited<ReturnType<typeof listStudents>>, TError = ErrorType<unknown>>(params?: ListStudentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listStudents>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listStudents>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListStudentsQueryResult = NonNullable<Awaited<ReturnType<typeof listStudents>>>;
export type ListStudentsQueryError = ErrorType<unknown>;
export declare function useListStudents<TData = Awaited<ReturnType<typeof listStudents>>, TError = ErrorType<unknown>>(params?: ListStudentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listStudents>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListNotificationsUrl: () => string;
export declare const listNotifications: (options?: Parameters<typeof customFetch>[1]) => Promise<Notification[]>;
export declare const getListNotificationsQueryKey: () => readonly ["/api/notifications"];
export declare const getListNotificationsQueryOptions: <TData = Awaited<ReturnType<typeof listNotifications>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listNotifications>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listNotifications>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListNotificationsQueryResult = NonNullable<Awaited<ReturnType<typeof listNotifications>>>;
export type ListNotificationsQueryError = ErrorType<unknown>;
export declare function useListNotifications<TData = Awaited<ReturnType<typeof listNotifications>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listNotifications>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map